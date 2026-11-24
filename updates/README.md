# 聆记更新通道

安装包内置了一个更新检查器：

- 登录后检查一次，之后每 6 小时检查一次
- 只在有更新时显示一个可关闭的浮层，不弹强制窗口
- 录音页不显示更新提示，不会打断课堂
- 检查失败、断网、模型不可用都不会影响正常使用
- 用户点击「下载更新」后自行关闭旧窗口并运行新安装包，课程数据保留

## 1. 先准备一个公网 HTTPS 地址

把两个文件放到任意静态托管（对象存储、Nginx、GitHub Pages、Cloudflare Pages 都可）：

```text
https://your-domain.com/updates/latest.json
https://your-domain.com/downloads/LingJi-Setup-<version>.exe
```

更新清单和安装包必须能通过 HTTPS 直接访问。

## 2. 构建一个带更新通道的安装包

在构建时把清单地址写进应用：

```powershell
$env:UPDATE_MANIFEST_URL = "https://your-domain.com/updates/latest.json"
pnpm installer:all
```

这会：

- 把更新地址打进单文件 exe / 安装版服务端
- 在免管理员便携目录里生成 `update-feed.txt`
- 生成 `release/LingJi-Setup-<当前版本>.exe`

如果构建时没有设置这个变量，安装包仍能正常使用，但「检查更新」会显示“尚未配置更新通道”。

## 3. 发布一个更新

先把新版本安装包上传到固定下载地址，再生成清单：

```powershell
node scripts/build-update-manifest.mjs `
  --installer release/LingJi-Setup-1.2.0.exe `
  --url https://your-domain.com/downloads/LingJi-Setup-1.2.0.exe `
  --version 1.2.0
```

脚本会读取 `updates/notes-1.2.0.md`，生成 `release/latest.json`，自动计算 SHA256 和文件大小。把这个 JSON 覆盖到清单地址即可。

更新清单格式：

```json
{
  "version": "1.2.0",
  "publishedAt": "2026-12-01T08:00:00.000Z",
  "notes": ["用户能看懂的一条更新说明"],
  "downloadUrl": "https://your-domain.com/downloads/LingJi-Setup-1.2.0.exe",
  "sha256": "64 位小写十六进制",
  "size": 22616210
}
```

## 4. 重要：已经发出去的 1.0.0 收不到自动通知

1.0.0 的 exe 里**没有更新检查代码**，无法从远端给它推送通知。这是客户端能力限制，不是清单配置问题。

所以第一次需要手动把 1.2.0 安装包发给已经拿到旧版的人。他们安装 1.2.0 后，后续版本才会通过本机制收到通知。1.2.0 安装包必须用真实的 `UPDATE_MANIFEST_URL` 构建，否则 1.2.0 用户也不会自动收到后续版本。

## 5. 兼容与回滚

- 更新是可选操作，旧版本可以继续运行
- 安装包只覆盖程序文件；`%LOCALAPPDATA%\LingJi` 下的课程、录音、图片和 API 设置会保留
- 更新清单版本号必须大于客户端当前版本才会提示
- 如果清单写错或服务器暂时不可用，客户端只会在手动检查时提示失败，不影响纪要和问答
