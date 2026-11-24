import assert from "node:assert/strict";
import http from "node:http";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4173";
const MOCK_PORT = 4198;
let cookie = "";
let asrAuthorization = "";
let asrContentType = "";
let asrBody = "";

const mock = http.createServer((req, res) => {
  if (req.url?.endsWith("/audio/transcriptions") && req.method === "POST") {
    asrAuthorization = String(req.headers.authorization || "");
    asrContentType = String(req.headers["content-type"] || "");
    req.on("data", (chunk) => {
      asrBody += chunk;
    });
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ text: "这是 ASR 测试识别出来的课堂内容。" }));
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

await new Promise((resolve) => mock.listen(MOCK_PORT, "127.0.0.1", resolve));

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

try {
  const login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "demo", password: "demo1234" }),
  });
  assert.equal(login.response.status, 200);

  const initial = await request("/api/settings");
  const originalAsr = initial.body.asr;

  const saved = await request("/api/settings", {
    method: "PUT",
    body: JSON.stringify({
      provider: initial.body.llm.provider,
      baseUrl: initial.body.llm.baseUrl,
      model: initial.body.llm.model,
      asr: {
        enabled: true,
        baseUrl: `http://127.0.0.1:${MOCK_PORT}/v1`,
        model: "mock-asr",
        language: "zh",
        apiKey: "asr-test-key",
      },
    }),
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.asr.configured, true);
  assert.equal(saved.body.asr.hasApiKey, true);

  const course = await request("/api/courses", {
    method: "POST",
    body: JSON.stringify({ name: `ASR 测试 ${Date.now()}`, teacher: "测试老师" }),
  });
  const courseId = course.body.course.id;
  const lecture = await request("/api/lectures", {
    method: "POST",
    body: JSON.stringify({ courseId }),
  });
  const lectureId = lecture.body.lecture.id;

  const audio = Buffer.alloc(4096, 9);
  const asr = await request(`/api/lectures/${lectureId}/asr`, {
    method: "POST",
    headers: { "Content-Type": "audio/webm" },
    body: audio,
  });
  assert.equal(asr.response.status, 200);
  assert.equal(asr.body.text, "这是 ASR 测试识别出来的课堂内容。");
  assert.equal(asrAuthorization, "Bearer asr-test-key");
  assert.ok(asrContentType.startsWith("multipart/form-data; boundary="));
  assert.ok(asrBody.includes('name="model"'));
  assert.ok(asrBody.includes("mock-asr"));
  assert.ok(asrBody.includes('name="language"'));

  const cleared = await request("/api/settings", {
    method: "PUT",
    body: JSON.stringify({
      provider: initial.body.llm.provider,
      baseUrl: initial.body.llm.baseUrl,
      model: initial.body.llm.model,
      asr: {
        enabled: false,
        baseUrl: originalAsr.baseUrl,
        model: originalAsr.model,
        language: originalAsr.language,
        clearApiKey: true,
      },
    }),
  });
  assert.equal(cleared.response.status, 200);
  assert.equal(cleared.body.asr.configured, false);

  await request(`/api/courses/${courseId}`, { method: "DELETE" });
  console.log("✓ 服务端 ASR 配置、分片转发、Key 鉴权与清理全部通过");
} finally {
  mock.close();
}
