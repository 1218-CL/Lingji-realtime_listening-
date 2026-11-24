import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4173";
const username = `qa_${Date.now().toString(36)}`;
const password = "qa-password-2026";
let cookie = "";

async function request(path, options = {}, withCookie = true) {
  const headers = new Headers(options.headers || {});
  if (withCookie && cookie) headers.set("Cookie", cookie);
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${BASE}${path}`, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

const registered = await request(
  "/api/auth/register",
  {
    method: "POST",
    body: JSON.stringify({ username, password, displayName: "回归测试" }),
  },
  false,
);
assert.equal(registered.response.status, 201);
assert.equal(registered.body.user.username, username);
assert.ok(cookie.startsWith("lingji_session="), "注册后应自动登录");

const me = await request("/api/auth/me");
assert.equal(me.response.status, 200);
assert.equal(me.body.user.username, username);

const duplicate = await request(
  "/api/auth/register",
  {
    method: "POST",
    body: JSON.stringify({ username, password }),
  },
  false,
);
assert.equal(duplicate.response.status, 409, "重复用户名应被拒绝");

const logout = await request("/api/auth/logout", { method: "POST" });
assert.equal(logout.response.status, 200);
cookie = "";
const signedOut = await request("/api/auth/me");
assert.equal(signedOut.response.status, 200);
assert.equal(signedOut.body.user, null);

const wrongPassword = await request(
  "/api/auth/login",
  {
    method: "POST",
    body: JSON.stringify({ username, password: "wrong-password" }),
  },
  false,
);
assert.equal(wrongPassword.response.status, 401);

const login = await request(
  "/api/auth/login",
  {
    method: "POST",
    body: JSON.stringify({ username, password }),
  },
  false,
);
assert.equal(login.response.status, 200);
assert.equal(login.body.user.username, username);

console.log(`✓ 注册、自动登录、重复用户名、登出、错误密码与重新登录全部通过（${username}）`);
