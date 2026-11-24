import fs from "node:fs";
import path from "node:path";
import { exec as pkgExec } from "@yao-pkg/pkg";
import { build as esbuild } from "esbuild";
import * as ResEdit from "resedit";

const ROOT = process.cwd();
const PACKAGE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
);
const VERSION = PACKAGE.version;
const [VERSION_MAJOR, VERSION_MINOR, VERSION_PATCH] = VERSION.split(".").map(Number);
const RELEASE_DIR = path.join(ROOT, "release");
const EXE_PATH = path.join(RELEASE_DIR, "LingJi.exe");
const ICON_PATH = path.join(ROOT, "build", "icon.ico");
const DIST_DIR = path.join(ROOT, "dist");
const STAGE_DIR = path.join(ROOT, "build", "desktop-stage");
const STAGE_ENTRY = path.join(STAGE_DIR, "desktop.mjs");

if (!fs.existsSync(path.join(DIST_DIR, "index.html"))) {
  console.error("找不到 dist/index.html。请先运行 pnpm build。");
  process.exit(1);
}
if (!fs.existsSync(ICON_PATH)) {
  console.error("找不到 build/icon.ico，无法写入应用图标。");
  process.exit(1);
}

if (fs.existsSync(RELEASE_DIR)) {
  const resolved = path.resolve(RELEASE_DIR);
  if (resolved !== RELEASE_DIR) throw new Error("release 路径校验失败");
  fs.rmSync(resolved, { recursive: true, force: true });
}
fs.rmSync(STAGE_DIR, { recursive: true, force: true });
fs.mkdirSync(RELEASE_DIR, { recursive: true });
fs.mkdirSync(STAGE_DIR, { recursive: true });

console.log("正在把服务端与依赖打包成单文件…");
await esbuild({
  entryPoints: [path.join(ROOT, "server", "desktop.mjs")],
  outfile: STAGE_ENTRY,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  legalComments: "none",
  define: {
    "process.env.LINGJI_BUILTIN_UPDATE_URL": JSON.stringify(
      process.env.UPDATE_MANIFEST_URL || "",
    ),
  },
  banner: {
    js: [
      'import { fileURLToPath as __lj_fileURLToPath } from "node:url";',
      'import { dirname as __lj_dirname } from "node:path";',
      'import { createRequire as __lj_createRequire } from "node:module";',
      "const __filename = __lj_fileURLToPath(import.meta.url);",
      "const __dirname = __lj_dirname(__filename);",
      "const require = __lj_createRequire(import.meta.url);",
    ].join("\n"),
  },
});

fs.cpSync(DIST_DIR, path.join(STAGE_DIR, "dist"), { recursive: true });

fs.writeFileSync(
  path.join(STAGE_DIR, "package.json"),
  JSON.stringify(
    {
      name: "lingji-desktop",
      version: VERSION,
      private: true,
      type: "module",
      bin: "desktop.mjs",
      pkg: {
        assets: ["dist/**/*"],
        sea: true,
        seaConfig: { disableExperimentalSEAWarning: true },
        compress: "Brotli",
      },
    },
    null,
    2,
  ),
  "utf8",
);

console.log("正在生成 Windows 可执行文件（首次会下载 Node 基础镜像）…");
const originalCwd = process.cwd();
process.chdir(STAGE_DIR);
try {
  await pkgExec([
    ".",
    "--sea",
    "--target",
    "node22-win-x64",
    "--output",
    EXE_PATH,
  ]);
} finally {
  process.chdir(originalCwd);
}

if (!fs.existsSync(EXE_PATH)) {
  console.error("pkg 没有生成可执行文件。");
  process.exit(1);
}

console.log("正在写入图标与 Windows 版本信息…");
const exeData = fs.readFileSync(EXE_PATH);
// Node's official Windows binary is Authenticode-signed. We only read it to
// replace resources and intentionally emit an unsigned portable build.
const exe = ResEdit.NtExecutable.from(exeData, { ignoreCert: true });
const resources = ResEdit.NtExecutableResource.from(exe);

const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(ICON_PATH));
const iconGroups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
const groupId = iconGroups[0]?.id;
if (!groupId) throw new Error("基础可执行文件没有图标资源组，无法注入图标。");
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
  resources.entries,
  groupId,
  1033,
  iconFile.icons.map((item) => item.data),
);

const versionList = ResEdit.Resource.VersionInfo.fromEntries(resources.entries);
if (versionList.length) {
  const version = versionList[0];
  version.setFileVersion(
    VERSION_MAJOR,
    VERSION_MINOR,
    VERSION_PATCH,
    0,
    1033,
  );
  version.setProductVersion(
    VERSION_MAJOR,
    VERSION_MINOR,
    VERSION_PATCH,
    0,
    1033,
  );
  version.setStringValues(
    { lang: 1033, codepage: 1200 },
    {
      FileDescription: "聆记 LingJi - 本地课堂助手",
      ProductName: "聆记 LingJi",
      CompanyName: "LingJi",
      ProductVersion: VERSION,
      FileVersion: `${VERSION}.0`,
      OriginalFilename: "LingJi.exe",
      LegalCopyright: "© 2026 LingJi",
    },
  );
  version.outputToResourceEntries(resources.entries);
}

resources.outputResource(exe);
fs.writeFileSync(EXE_PATH, Buffer.from(exe.generate()));

const guide = `聆记 LingJi · Windows 便携版

1. 双击 LingJi.exe。
2. 程序会在本机启动服务，并用 Edge / Chrome 打开应用窗口。
3. 第一次使用请注册账号；没有 demo 账号。
4. 默认使用浏览器后台语音识别，请允许麦克风权限；浏览器识别不稳时可在设置中接入外部 ASR。

数据位置
默认保存在：%LOCALAPPDATA%\\LingJi
如果想放到 U 盘或固定目录，可在启动前设置环境变量 LINGJI_DATA_DIR。

退出
关闭 LingJi 的黑色命令行窗口即可停止本地服务。
再次双击 LingJi.exe 会复用已经运行的实例并重新打开页面。

说明
- 这是便携版，不需要安装 Node.js。
- 程序使用浏览器承载界面，默认识别能力与 Edge / Chrome 一致；可在设置中启用服务端 ASR。
- 未做代码签名，Windows SmartScreen 可能提示“未知发布者”；请确认文件来源。
- 请只在获得许可的情况下录制课堂内容，并尊重老师的知识产权。

如果双击时要求管理员权限
1. 确认已经解压，不要在压缩包预览窗口中直接运行。
2. 右键 LingJi.exe -> 属性 -> 常规，若看到“解除锁定”请勾选。
3. 右键 LingJi.exe -> 属性 -> 兼容性，取消“以管理员身份运行此程序”。
4. 仍然被拦截时，请向发送者索取 LingJi-Portable-NoAdmin.zip，
   解压后双击其中的 启动聆记.cmd。
`;
fs.writeFileSync(path.join(RELEASE_DIR, "使用说明.txt"), guide, "utf8");

const sizeMb = (fs.statSync(EXE_PATH).size / 1024 / 1024).toFixed(1);
console.log("");
console.log(`✓ 已生成 ${EXE_PATH}（${sizeMb} MB）`);
console.log(`✓ 使用说明：${path.join(RELEASE_DIR, "使用说明.txt")}`);
