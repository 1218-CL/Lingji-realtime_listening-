import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PACKAGE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
);

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const version = arg("version", PACKAGE.version);
const installer = path.resolve(
  ROOT,
  arg("installer", path.join("release", `LingJi-Setup-${version}.exe`)),
);
const downloadUrl = arg("url", process.env.UPDATE_DOWNLOAD_URL || "").trim();
const out = path.resolve(ROOT, arg("out", path.join("release", "latest.json")));
const notesFile = path.resolve(
  ROOT,
  arg("notes-file", path.join("updates", `notes-${version}.md`)),
);

if (!fs.existsSync(installer)) {
  console.error(`找不到安装包：${installer}`);
  process.exit(1);
}
if (!/^https:\/\//i.test(downloadUrl)) {
  console.error("--url 必须是安装包的 HTTPS 公网地址。");
  process.exit(1);
}

const notes = fs.existsSync(notesFile)
  ? fs
      .readFileSync(notesFile, "utf8")
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
      .filter((line) => line && !line.startsWith("#"))
      .slice(0, 8)
  : [];

const data = fs.readFileSync(installer);
const manifest = {
  version,
  publishedAt: new Date().toISOString(),
  notes,
  downloadUrl,
  sha256: crypto.createHash("sha256").update(data).digest("hex"),
  size: data.length,
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`✓ 已生成 ${out}`);
console.log(`  版本：${manifest.version}`);
console.log(`  安装包：${downloadUrl}`);
console.log(`  SHA256：${manifest.sha256}`);
