import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4173";
let cookie = "";

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (cookie) headers.set("Cookie", cookie);
  if (options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${BASE}${path}`, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

const unauthorized = await request("/api/dashboard");
assert.equal(unauthorized.response.status, 401, "未登录接口应拒绝访问");

const login = await request("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ username: "demo", password: "demo1234" }),
});
assert.equal(login.response.status, 200);

const originalSettings = (await request("/api/settings")).body.llm;
const originalProfile = (await request("/api/auth/me")).body.user;

const fakeKey = "sk-smoke-test-1234";
const saved = await request("/api/settings", {
  method: "PUT",
  body: JSON.stringify({
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    apiKey: fakeKey,
  }),
});
assert.equal(saved.response.status, 200);
assert.equal(saved.body.llm.hasApiKey, true);
assert.equal(saved.body.llm.apiKeyLast4, "1234");
assert.ok(!JSON.stringify(saved.body).includes(fakeKey), "接口不得回传 API Key 明文");
assert.ok(!("apiKeyEnc" in saved.body.llm), "接口不得暴露密文");

const fetchedSettings = (await request("/api/settings")).body.llm;
assert.equal(fetchedSettings.hasApiKey, true);
assert.ok(!JSON.stringify(fetchedSettings).includes(fakeKey));

const restoredSettings = await request("/api/settings", {
  method: "PUT",
  body: JSON.stringify({
    provider: originalSettings.provider,
    baseUrl: originalSettings.baseUrl,
    model: originalSettings.model,
    clearApiKey: true,
  }),
});
assert.equal(restoredSettings.response.status, 200);
assert.equal(restoredSettings.body.llm.hasApiKey, false);

const profile = await request("/api/me", {
  method: "PATCH",
  body: JSON.stringify({ displayName: "烟雾测试" }),
});
assert.equal(profile.response.status, 200);
assert.equal(profile.body.user.displayName, "烟雾测试");
const restoreProfile = await request("/api/me", {
  method: "PATCH",
  body: JSON.stringify({ displayName: originalProfile.displayName }),
});
assert.equal(restoreProfile.body.user.displayName, originalProfile.displayName);

const course = await request("/api/courses", {
  method: "POST",
  body: JSON.stringify({ name: "临时验证课程", teacher: "验证老师" }),
});
assert.equal(course.response.status, 201);
const courseId = course.body.course.id;
const deleted = await request(`/api/courses/${courseId}`, { method: "DELETE" });
assert.equal(deleted.response.status, 200);
const missing = await request(`/api/courses/${courseId}`);
assert.equal(missing.response.status, 404);

console.log("✓ 未授权拦截、API Key 加密不回传、资料修改与课程生命周期全部通过");
