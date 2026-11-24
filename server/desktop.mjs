import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_NAME = "LingJi";
const DEFAULT_PORT = 4173;
const logPath = path.join(os.homedir(), "LingJi-startup.log");

function resolveDistDir() {
  const candidates = [
    path.resolve(here, "..", "dist"),
    path.resolve(here, "dist"),
    path.resolve(path.dirname(process.execPath), "dist"),
  ];
  return (
    candidates.find((candidate) =>
      fs.existsSync(path.join(candidate, "index.html")),
    ) || candidates[0]
  );
}

function resolveUpdateFeed() {
  if (process.env.UPDATE_MANIFEST_URL) return process.env.UPDATE_MANIFEST_URL;
  const candidates = [
    path.join(path.dirname(process.execPath), "update-feed.txt"),
    path.join(here, "update-feed.txt"),
    path.join(here, "..", "update-feed.txt"),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const value = fs
        .readFileSync(file, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith("#"));
      if (value) return value;
    } catch {
      // A malformed optional feed file must not block the app.
    }
  }
  return "";
}

process.env.UPDATE_MANIFEST_URL = resolveUpdateFeed();

function writeStartupLog(message) {
  try {
    fs.appendFileSync(
      logPath,
      `[${new Date().toISOString()}] ${message}\n`,
      "utf8",
    );
  } catch {
    // Logging must never be the reason the app fails.
  }
}

function reportFatal(error) {
  const detail = error instanceof Error ? error.stack || error.message : String(error);
  console.error(detail);
  writeStartupLog(detail);
  if (process.platform === "win32" && process.env.LINGJI_NO_BROWSER !== "1") {
    try {
      spawn("notepad.exe", [logPath], {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      }).unref();
    } catch {
      // ignore
    }
  }
  process.exitCode = 1;
}

process.on("uncaughtException", reportFatal);
process.on("unhandledRejection", reportFatal);

process.title = "LingJi 聆记 - 关闭此窗口即可退出";
process.env.LINGJI_DIST_DIR = resolveDistDir();
process.env.HOST = "127.0.0.1";
if (process.env.SEED_DEMO === undefined) process.env.SEED_DEMO = "false";

function canWriteDirectory(directory) {
  try {
    fs.mkdirSync(directory, { recursive: true });
    const probe = path.join(directory, `.lingji-write-${process.pid}`);
    fs.writeFileSync(probe, "ok", "utf8");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function resolveDataDir() {
  const explicit = process.env.LINGJI_DATA_DIR || process.env.DATA_DIR;
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (!canWriteDirectory(resolved)) {
      throw new Error(`指定的数据目录不可写：${resolved}`);
    }
    return resolved;
  }

  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const candidates = [
    path.join(localAppData, APP_NAME),
    path.join(os.homedir(), APP_NAME),
    path.join(path.dirname(process.execPath), "LingJiData"),
    path.join(os.tmpdir(), APP_NAME),
  ].filter((value, index, list) => list.indexOf(value) === index);

  for (const candidate of candidates) {
    if (canWriteDirectory(candidate)) return candidate;
  }
  throw new Error("找不到可写的用户数据目录。");
}

const dataDir = resolveDataDir();
process.env.DATA_DIR = dataDir;

function canListen(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port, "127.0.0.1");
  });
}

async function isOurApp(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/config`, {
      signal: AbortSignal.timeout(700),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return typeof data?.demoAvailable === "boolean";
  } catch {
    return false;
  }
}

async function choosePort() {
  const preferred = Number(process.env.PORT) || DEFAULT_PORT;
  // Reuse an existing LingJi instance even if a port conflict pushed it past
  // the preferred port on a previous launch.
  for (let port = preferred; port < preferred + 24; port += 1) {
    if (await isOurApp(port)) return { port, reuse: true };
  }
  for (let port = preferred; port < preferred + 24; port += 1) {
    if (await canListen(port)) return { port, reuse: false };
  }
  throw new Error("无法找到可用的本地端口。");
}

function browserCandidates() {
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 =
    process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  return [
    path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
  ];
}

function openBrowser(url) {
  if (process.env.LINGJI_NO_BROWSER === "1") return;
  if (process.platform !== "win32") {
    const opener = process.platform === "darwin" ? "open" : "xdg-open";
    spawn(opener, [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  const browser = browserCandidates().find((candidate) => fs.existsSync(candidate));
  if (browser) {
    // Chromium app mode gives the web app a desktop-window feel while keeping
    // the browser's Web Speech support, which Electron does not provide.
    spawn(
      browser,
      [`--app=${url}`, "--window-size=1440,940", "--no-first-run"],
      { detached: true, stdio: "ignore", windowsHide: false },
    ).unref();
    return;
  }

  spawn("cmd.exe", ["/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
}

async function waitForReady(port) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await isOurApp(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 220));
  }
  return false;
}

async function main() {
  const selected = await choosePort();
  const url = `http://127.0.0.1:${selected.port}`;

  if (selected.reuse) {
    console.log(`聆记已经在运行：${url}`);
    openBrowser(url);
    return;
  }

  process.env.PORT = String(selected.port);
  await import("./index.mjs");
  if (!(await waitForReady(selected.port))) {
    throw new Error("聆记启动超时。请检查是否有安全软件拦截了本地端口。");
  }

  openBrowser(url);
  writeStartupLog(`started on ${url}; data=${dataDir}`);
  console.log("");
  console.log(
    process.env.LINGJI_NO_BROWSER === "1"
      ? `  本地服务已启动：${url}`
      : `  聆记已在浏览器打开：${url}`,
  );
  console.log(`  本地数据目录：${dataDir}`);
  console.log("  关闭这个窗口即可停止服务。");
  console.log("");
}

main().catch(reportFatal);
