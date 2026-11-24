# 把聆记开放给其他人使用

这个项目默认是「本机单进程」应用。开放给其他人用，核心是三件事：

1. 让服务跑在一台别人能访问的机器上；
2. 用 HTTPS 提供访问（否则浏览器不会给麦克风权限）；
3. 给 `.data/` 一个持久化位置并做好备份。

下面按「正式部署」「临时演示」「托管平台」三种场景说明。

---

## 方案一：VPS + Docker Compose + Caddy（推荐）

适合长期给同学、朋友或小范围用户使用。一台 2 核 2G 的 VPS 足够小规模使用，成本通常每月几美元。

### 1. 准备

- 一台 Linux VPS（Ubuntu 22.04/24.04 均可）
- 一个域名，例如 `lingji.example.com`
- 域名 DNS 的 A/AAAA 记录指向 VPS
- 防火墙开放 80 和 443；**不要**把 4173 直接暴露到公网

安装 Docker 与 Compose 插件（以 Ubuntu 为例，具体以 Docker 官方文档为准）：

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登录后验证
docker compose version
```

### 2. 上传项目并配置密钥

```bash
cd /opt
# 方式 A：已经推到 Git 仓库
git clone <你的仓库地址> lingji

# 方式 B：从本机上传（在项目根目录执行，注意不要把本机 .data 覆盖到服务器）
# rsync -av --exclude node_modules --exclude dist --exclude .data \
#   ./ user@your-server:/opt/lingji/

cd lingji

cp .env.example .env
openssl rand -base64 48
# 把输出写入 .env 的 APP_SECRET
nano .env
```

`.env` 至少应类似：

```dotenv
APP_SECRET=这里填写一串足够长的随机值
COOKIE_SECURE=true
TRUST_PROXY=true
SEED_DEMO=false
```

`SEED_DEMO=false` 很重要：公开部署不应该存在 `demo / demo1234` 这个已知密码的账号。全新的数据卷不会创建演示账号。

### 3. 启动应用

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f lingji
```

Compose 只把端口绑定在 `127.0.0.1:4173`，公网不能绕过 HTTPS 直接访问。

### 4. 用 Caddy 自动配置 HTTPS

Caddy 会在域名解析正确、80/443 可达时自动申请证书。

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
# 按 https://caddyserver.com/docs/install 添加官方源并安装 caddy
sudo apt install -y caddy

sudo cp deploy/Caddyfile.example /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile   # 把 lingji.example.com 换成你的域名
sudo systemctl reload caddy
```

检查：

```bash
curl https://你的域名/api/health
```

看到 `{"ok":true,...}` 即可。

### 5. 邀请其他人

直接把 `https://你的域名` 发给对方。对方点击「注册」创建账号即可。

当前版本是开放注册。如果只想给自己和熟人使用，可以：

- 暂不公开发布域名链接；
- 后续给注册接口增加邀请码；
- 或在反向代理层加访问控制（例如 Cloudflare Access）。

---

## 方案二：临时演示 / 内网测试

### Cloudflare Tunnel 或 ngrok

如果只是临时给远处的人看一眼，不需要买服务器，可以让本机服务通过 HTTPS 隧道暴露：

```bash
# 终端 1：本机运行生产构建
pnpm build
pnpm start

# 终端 2：创建临时 HTTPS 地址
cloudflared tunnel --url http://127.0.0.1:4173
# 或
ngrok http 4173
```

工具会给出一个 HTTPS 地址。把地址发给对方即可。

注意：

- 你的电脑必须保持开机，隧道关闭后地址失效。
- 免费隧道的域名通常会变化。
- 不要在含演示账号的现有数据上直接公开。公开前应使用全新数据目录，或确认 `demo` 账号已移除。
- 这种方式适合演示，不适合长期运营。

如果只想用独立数据目录快速验证公开模式，可以：

```bash
# 仅用于本机验证：全新数据目录 + 不创建 demo 账号
DATA_DIR=./.data-public SEED_DEMO=false PORT=4180 pnpm start
```

打开 `http://127.0.0.1:4180` 应看到登录页没有「一键体验示例课堂」，注册后即为普通用户。

### 局域网访问

只把 `HOST` 改成 `0.0.0.0` 并用 `http://192.168.x.x:4173` 访问时，**浏览器不会授予麦克风权限**，因为局域网 HTTP 不是安全上下文。需要在局域网内配置 HTTPS（例如 Caddy 内部证书），或使用上面的 HTTPS 隧道。

---

## 方案三：Railway / Render / Fly.io 等托管平台

也可以部署到支持 Node 服务和持久化磁盘的平台。配置要点：

| 项目 | 值 |
| --- | --- |
| Build command | `pnpm build` |
| Start command | `pnpm start` |
| 运行端口 | 平台注入的 `PORT`，或 `4173` |
| HOST | `0.0.0.0` |
| 持久化磁盘 | 挂载到 `/app/.data` |
| 实例数 | **1**（当前 JSON 存储不支持多实例共享写入） |
| 环境变量 | `APP_SECRET`、`COOKIE_SECURE=true`、`TRUST_PROXY=true`、`SEED_DEMO=false` |

**必须先确认平台提供持久化磁盘。** 没有持久磁盘时，重新部署会丢失账号、课程、转写和录音。平台一般会自动提供 HTTPS，不需要再配置 Caddy。

---

## 账号运维（删除 demo、重置密码）

当前没有管理后台，提供两个管理员脚本。它们会直接修改 `.data/db.json`，**必须先停止服务**，避免运行中的服务把内存数据写回覆盖。

Docker 部署：

```bash
# 停止应用（数据 volume 保留）
docker compose stop lingji

# 删除 demo 账号及示例课程、课堂和录音
docker compose run --rm lingji node scripts/remove-demo.mjs --yes

# 给忘记密码的用户生成随机新密码
docker compose run --rm lingji node scripts/reset-password.mjs --user alice

# 重新启动
docker compose start lingji
```

非 Docker 部署：

```bash
# 先停止正在运行的服务
node scripts/remove-demo.mjs --yes
node scripts/reset-password.mjs --user alice
pnpm start
```

重置密码会让该用户已有的所有登录会话失效。新密码只会打印在终端一次，请通过安全渠道发给对方。

---

## 数据备份

Docker Compose 使用名为 `lingji_data` 的 volume。查看：

```bash
docker volume ls
```

备份（在项目目录执行，先创建 `backups/`）：

```bash
mkdir -p backups
docker run --rm \
  -v lingji_data:/data \
  -v "$PWD/backups":/backup \
  alpine sh -c 'tar czf /backup/lingji-$(date +%F-%H%M).tar.gz -C /data .'
```

恢复前先停服务：

```bash
docker compose down
docker run --rm \
  -v lingji_data:/data \
  -v "$PWD/backups":/backup \
  alpine sh -c 'rm -rf /data/* && tar xzf /backup/你的备份文件.tar.gz -C /data'
docker compose up -d
```

`.data/` 里包含：

- `db.json`：账号、课程、转写、纪要、问答；
- `audio/`：课堂录音；
- `secret`：API Key 加密主密钥。

**`secret` 和数据库必须一起备份。** 如果丢失 `secret` 或更换 `APP_SECRET`，用户之前保存的 API Key 将无法解密，需要重新填写。

---

## 更新版本

```bash
cd /opt/lingji
git pull
docker compose up -d --build
```

更新不会删除 `lingji_data` volume。

---

## 上线前检查清单

- [ ] 域名已解析，HTTPS 可访问
- [ ] `COOKIE_SECURE=true`
- [ ] `TRUST_PROXY=true`
- [ ] `SEED_DEMO=false`，且数据中不存在 `demo` 账号
- [ ] `APP_SECRET` 是唯一随机值，且已和 `.data/` 一起备份
- [ ] `.env` 没有被提交到 Git
- [ ] 4173 端口没有直接暴露公网
- [ ] 服务器磁盘剩余空间足够（录音会持续占用）
- [ ] 已做一次数据库 + 音频恢复演练
- [ ] 单实例运行；没有开多个副本共享同一个 `.data`
- [ ] 已告知使用者：录音前需获得老师/课堂许可，尊重知识产权

---

## 当前版本的限制（公开前请读）

这是一个面向小范围使用的产品原型，不是大规模多租户系统：

- **没有邮箱验证、找回密码、账号注销**。用户忘记密码后目前需要管理员手工处理。
- **JSON 单文件存储**，所有写入串行化；适合小范围，不适合高并发或多实例。
- **录音存在本机磁盘**，没有对象存储、CDN、自动清理策略。
- **速率限制在进程内存中**，重启会清空；分布式部署需要 Redis 或网关层限流。
- **密码只做 scrypt 哈希，没有二次验证**。
- **开放注册**，公开后可能遭遇垃圾注册；可以通过邀请码或 Cloudflare Access 限制入口。
- **API Key 由服务端加密保存**，但拥有服务器文件与 `secret` 的人理论上可以解密；如果给陌生人使用，应在隐私说明中讲清楚。

如果用户规模超过十几人、需要邮件、付费、审计或多副本，建议下一步把存储迁移到 PostgreSQL/SQLite，音频放对象存储，并引入邮件服务、找回密码、管理后台和配额。

---

## 规模建议

| 场景 | 建议 |
| --- | --- |
| 自己用 | 本机 `pnpm dev` / `pnpm start` |
| 给 5–20 个同学用 | 一台 2C2G VPS + Docker + Caddy + 定期备份 |
| 临时展示 | Cloudflare Tunnel / ngrok |
| 正式多用户产品 | 迁移数据库与对象存储，拆分前端/API，接入监控与队列 |
