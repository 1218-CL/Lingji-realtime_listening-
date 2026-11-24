import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const PACKAGE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
);
const NSIS = path.join(ROOT, "build", "nsis", "makensis.exe");
const NSI = path.join(ROOT, "installer", "LingJi.nsi");
const PAYLOAD = path.join(ROOT, "release", "LingJi-Portable-NoAdmin");
const INSTALLER = path.join(
  ROOT,
  "release",
  `LingJi-Setup-${PACKAGE.version}.exe`,
);

if (!fs.existsSync(NSIS)) {
  console.error(
    [
      "找不到 NSIS 编译器：build\\nsis\\makensis.exe",
      "请下载 NSIS 3.11 并解压到 build/nsis：",
      "  https://nsis.sourceforge.io/Download",
      "需要保留 Bin、Contrib、Include、Plugins、Stubs 和 makensis.exe。",
    ].join("\n"),
  );
  process.exit(1);
}
if (!fs.existsSync(path.join(PAYLOAD, "node.exe"))) {
  console.error("找不到免管理员 payload。请先运行 node scripts/build-portable.mjs。");
  process.exit(1);
}

// NSIS Unicode script should be saved as UTF-8 with BOM for Chinese strings.
const source = fs.readFileSync(NSI, "utf8").replace(/^\uFEFF/, "");
fs.writeFileSync(NSI, `\uFEFF${source}`, "utf8");

// NSIS uses a large temporary mmap while compressing. On Windows the default
// %TEMP% may be locked down or on a small volume, so keep compiler temp files
// inside the project.
const compilerTemp = path.join(ROOT, "build", "nsis-tmp");
fs.mkdirSync(compilerTemp, { recursive: true });
const result = spawnSync(NSIS, ["/V2", NSI], {
  cwd: ROOT,
  stdio: "inherit",
  windowsHide: true,
  env: { ...process.env, TEMP: compilerTemp, TMP: compilerTemp },
});
if (result.status !== 0) process.exit(result.status || 1);
if (!fs.existsSync(INSTALLER)) {
  console.error("NSIS 没有生成安装程序。");
  process.exit(1);
}

const hash = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const checksumTargets = [
  path.join(ROOT, "release", "LingJi.exe"),
  path.join(ROOT, "release", "LingJi-Windows-x64.zip"),
  path.join(PAYLOAD, "node.exe"),
  path.join(ROOT, "release", "LingJi-Portable-NoAdmin.zip"),
  INSTALLER,
].filter((file) => fs.existsSync(file));
const lines = checksumTargets.map(
  (file) => `SHA256  ${path.basename(file)}  ${hash(file)}`,
);
fs.writeFileSync(
  path.join(ROOT, "release", "SHA256SUMS.txt"),
  `${lines.join("\n")}\n`,
  "utf8",
);

const sizeMb = (fs.statSync(INSTALLER).size / 1024 / 1024).toFixed(1);
console.log("");
console.log(`✓ 已生成安装程序 ${INSTALLER}（${sizeMb} MB）`);
console.log("  安装到当前用户，不需要管理员权限。");
