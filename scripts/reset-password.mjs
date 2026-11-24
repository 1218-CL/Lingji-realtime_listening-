import crypto from "node:crypto";
import fs from "node:fs";
import { DB_FILE } from "../server/config.mjs";
import { hashPassword } from "../server/auth.mjs";

const args = process.argv.slice(2);
const userIndex = args.findIndex((arg) => arg === "--user" || arg === "-u");
const username = userIndex >= 0 ? args[userIndex + 1] : "";

if (!username) {
  console.error(
    [
      "用法：先停止服务，再执行",
      "  node scripts/reset-password.mjs --user <用户名>",
      "脚本会生成一个随机新密码，并让该用户的所有登录会话失效。",
    ].join("\n"),
  );
  process.exit(1);
}

if (!fs.existsSync(DB_FILE)) {
  console.error(`找不到数据文件：${DB_FILE}`);
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
const user = (db.users || []).find(
  (item) => item.username.toLowerCase() === username.toLowerCase(),
);
if (!user) {
  console.error(`用户不存在：${username}`);
  process.exit(1);
}

const password = crypto.randomBytes(12).toString("base64url").slice(0, 16);
const hashed = hashPassword(password);
user.salt = hashed.salt;
user.passwordHash = hashed.hash;
db.sessions = (db.sessions || []).filter((session) => session.userId !== user.id);

const temp = `${DB_FILE}.tmp`;
fs.writeFileSync(temp, JSON.stringify(db, null, 2), "utf8");
fs.renameSync(temp, DB_FILE);

console.log(`用户：${user.username}`);
console.log(`新密码：${password}`);
console.log("该用户之前的登录会话已全部失效。请通过安全渠道把新密码发给对方。");
