import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const STAGE = path.join(ROOT, "build", "desktop-stage");
const RELEASE = path.join(ROOT, "release");
const OUT = path.join(RELEASE, "LingJi-Portable-NoAdmin");
const STAGE_ENTRY = path.join(STAGE, "desktop.mjs");
const STAGE_DIST = path.join(STAGE, "dist");
const LICENSE = path.join(ROOT, "build", "Node-LICENSE.txt");

if (!fs.existsSync(STAGE_ENTRY) || !fs.existsSync(path.join(STAGE_DIST, "index.html"))) {
  console.error("缺少 desktop-stage 产物。请先运行 node scripts/build-desktop.mjs。");
  process.exit(1);
}

const nodeCandidates = [
  process.env.NODE_OFFICIAL_EXE,
  path.join(
    os.homedir(),
    ".pkg-cache",
    "sea",
    "node-v22.23.5-win-x64.exe",
  ),
  path.join(ROOT, "build", "node-win-x64.exe"),
].filter(Boolean);
const nodeExe = nodeCandidates.find((candidate) => fs.existsSync(candidate));
if (!nodeExe) {
  console.error(
    "找不到官方 Node.js 22 Windows 可执行文件。请设置 NODE_OFFICIAL_EXE 指向 node.exe。",
  );
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

fs.copyFileSync(STAGE_ENTRY, path.join(OUT, "app.mjs"));
fs.cpSync(STAGE_DIST, path.join(OUT, "dist"), { recursive: true });
fs.copyFileSync(nodeExe, path.join(OUT, "node.exe"));
if (fs.existsSync(LICENSE)) {
  fs.copyFileSync(LICENSE, path.join(OUT, "Node-LICENSE.txt"));
}
if (process.env.UPDATE_MANIFEST_URL) {
  fs.writeFileSync(
    path.join(OUT, "update-feed.txt"),
    `${process.env.UPDATE_MANIFEST_URL.trim()}\n`,
    "utf8",
  );
}

const cmd = `@echo off
setlocal
cd /d "%~dp0"
title LingJi
if not exist "%~dp0node.exe" (
  echo node.exe is missing from this folder.
  pause
  exit /b 1
)
"%~dp0node.exe" "%~dp0app.mjs"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo LingJi failed to start. Exit code: %EXIT_CODE%.
  echo Check LingJi-startup.log in your user folder.
  pause
)
`;
fs.writeFileSync(path.join(OUT, "启动聆记.cmd"), cmd, "utf8");
// ASCII duplicate for zip tools or file systems that mangle Chinese names.
fs.writeFileSync(path.join(OUT, "Start-LingJi.cmd"), cmd, "utf8");

const guide = `聆记 LingJi · 免管理员便携版

为什么有这个版本？
某些 Windows 安全策略会拦截未签名的单文件 exe。这个版本改用 Node.js
官方签名的 node.exe 运行应用，因此通常不需要管理员权限。

使用方法
1. 先解压整个文件夹，不要只拖出某一个文件。
2. 双击「启动聆记.cmd」；如果文件名显示异常，双击 Start-LingJi.cmd。
3. 程序会启动本地服务，并用 Edge / Chrome 打开应用窗口。
4. 第一次使用请注册账号。
5. 关闭黑色命令行窗口即可停止服务。

不要直接双击 node.exe 或 app.mjs，它们需要由启动脚本组织运行。

数据位置
默认保存在 %LOCALAPPDATA%\\LingJi。
如果该目录不可写，会自动回退到用户目录、程序目录或临时目录。
也可以设置 LINGJI_DATA_DIR 指定目录。

如果仍然启动失败
同目录下不要缺少这些文件：
  node.exe
  app.mjs
  dist\\
  启动聆记.cmd
命令窗口会显示错误；同时查看用户目录下的 LingJi-startup.log。

其他说明
- 实时转写使用 Edge / Chrome 的 Web Speech，需要联网并允许麦克风。
- 请只在获得许可的情况下录制课堂内容。
- Node.js 的许可证见 Node-LICENSE.txt。
`;
fs.writeFileSync(path.join(OUT, "使用说明.txt"), guide, "utf8");

const sizeMb = (fs.statSync(path.join(OUT, "node.exe")).size / 1024 / 1024).toFixed(1);
console.log(`✓ 已生成免管理员版本：${OUT}`);
console.log(`  node.exe ${sizeMb} MB，双击「启动聆记.cmd」运行。`);
