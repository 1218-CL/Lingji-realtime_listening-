import assert from "node:assert/strict";
import fs from "node:fs";

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
  const contentType = response.headers.get("content-type") || "";
  let body;
  if (contentType.includes("application/json")) body = await response.json();
  else if (contentType.includes("text/event-stream")) body = await response.text();
  else body = await response.arrayBuffer();
  return { response, body };
}

async function json(path, options) {
  const { response, body } = await request(path, options);
  assert.ok(response.ok, `${path} 返回 ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const health = await json("/api/health");
assert.equal(health.ok, true);
const publicConfig = await json("/api/config");
assert.equal(typeof publicConfig.demoAvailable, "boolean");

const login = await json("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ username: "demo", password: "demo1234" }),
});
assert.equal(login.user.username, "demo");
assert.ok(cookie.startsWith("lingji_session="), "登录后应设置会话 Cookie");

const me = await json("/api/auth/me");
assert.equal(me.user.displayName, "林知夏");

const dashboard = await json("/api/dashboard");
assert.ok(dashboard.courses.length >= 4, "演示账号应有课程");
assert.ok(dashboard.recentLectures.length >= 1, "演示账号应有最近课堂");

const tempCourse = await json("/api/courses", {
  method: "POST",
  body: JSON.stringify({
    name: `自动测试课程 ${Date.now()}`,
    teacher: "测试老师",
  }),
});
const courseId = tempCourse.course.id;
const created = await json("/api/lectures", {
  method: "POST",
  body: JSON.stringify({ courseId }),
});
const lecture = created.lecture;
assert.equal(lecture.status, "recording");
assert.ok(lecture.id);

const segments = [
  {
    id: "smoke-1",
    text: "今天这节课我们讨论注意力经济。平台通过推荐算法决定用户看到什么内容。",
    at: 4,
  },
  {
    id: "smoke-2",
    text: "重点在于，用户的每一次停留和互动都会成为下一次推荐的材料。",
    at: 18,
  },
  {
    id: "smoke-3",
    text: "所以我们需要区分选择的自由，和被设计的选择集。这会影响公共讨论的质量。",
    at: 33,
  },
];

const synced = await json(`/api/lectures/${lecture.id}/transcript`, {
  method: "PUT",
  body: JSON.stringify({ segments }),
});
assert.equal(synced.count, 3);
const beforeNotes = await json(`/api/lectures/${lecture.id}`);
assert.equal(
  beforeNotes.lecture.summaryState.pendingChars,
  segments.map((item) => item.text).join("").length,
);
assert.equal(beforeNotes.lecture.summaryState.pendingImages, false);

const notes = await json(`/api/lectures/${lecture.id}/notes`, {
  method: "POST",
  body: JSON.stringify({ text: segments.map((item) => item.text).join("") }),
});
assert.equal(notes.source, "local");
assert.ok(notes.note.summary.length > 0);
assert.ok(notes.note.keyPoints.length >= 2);
assert.ok(notes.note.keywords.length >= 2);
assert.equal(notes.note.sections.length, 1, "首次摘要应生成一段分段摘要");
assert.ok(notes.note.sections[0].summary.length >= 30);
assert.ok(notes.note.sections[0].points.length >= 2);
assert.equal(notes.note.sections[0].index, 1);
assert.equal(notes.lecture.summaryState.pendingChars, 0);

const overallDiagram = await json(`/api/lectures/${lecture.id}/diagram`, {
  method: "POST",
  body: JSON.stringify({ scope: "overall" }),
});
assert.ok(overallDiagram.diagram.branches.length >= 2);
assert.equal(overallDiagram.source, "local");
const cachedOverall = await json(`/api/lectures/${lecture.id}/diagram`, {
  method: "POST",
  body: JSON.stringify({ scope: "overall" }),
});
assert.equal(cachedOverall.cached, true, "逻辑图应缓存");

const sectionDiagram = await json(`/api/lectures/${lecture.id}/diagram`, {
  method: "POST",
  body: JSON.stringify({
    scope: "section",
    sectionId: notes.note.sections[0].id,
  }),
});
assert.ok(sectionDiagram.diagram.branches.length >= 2);

const rebuilt = await json(`/api/lectures/${lecture.id}/notes`, {
  method: "POST",
  body: JSON.stringify({
    text: segments.map((item) => item.text).join(""),
    force: true,
  }),
});
assert.equal(rebuilt.note.sections.length, 1, "重新整理应重建分段摘要");
assert.ok(rebuilt.note.summary.length > 0);

const skippedNotes = await json(`/api/lectures/${lecture.id}/notes`, {
  method: "POST",
  body: JSON.stringify({ text: segments.map((item) => item.text).join("") }),
});
assert.equal(skippedNotes.skipped, true, "没有新增转写时不应重复请求模型");
assert.equal(skippedNotes.lecture.summaryState.pendingChars, 0);

const chat = await json(`/api/lectures/${lecture.id}/chat`, {
  method: "POST",
  body: JSON.stringify({
    content: "什么是被设计的选择集？",
    text: segments.map((item) => item.text).join(""),
  }),
});
assert.ok(chat.includes("event: done"), "问答应返回 SSE done 事件");
assert.ok(chat.includes("event: delta"), "问答应流式返回增量内容");

const finalized = await json(`/api/lectures/${lecture.id}`, {
  method: "PATCH",
  body: JSON.stringify({ status: "completed", durationSec: 42 }),
});
assert.equal(finalized.lecture.status, "completed");
assert.equal(finalized.lecture.durationSec, 42);

const imageUpload = await json(`/api/lectures/${lecture.id}/images`, {
  method: "POST",
  headers: { "Content-Type": "image/png" },
  body: fs.readFileSync("build/icon.png"),
});
assert.ok(imageUpload.image.id);
assert.equal(imageUpload.image.mime, "image/png");
const withImage = await json(`/api/lectures/${lecture.id}`);
assert.equal(withImage.lecture.images.length, 1);
assert.equal(withImage.lecture.imageCount, 1);
assert.equal(withImage.lecture.summaryState.pendingImages, true);
const imageResponse = await request(withImage.lecture.images[0].url);
assert.equal(imageResponse.response.status, 200);
assert.ok((imageResponse.response.headers.get("content-type") || "").includes("image/png"));
const imageNotes = await json(`/api/lectures/${lecture.id}/notes`, {
  method: "POST",
  body: JSON.stringify({
    text: segments.map((item) => item.text).join(""),
    forceImages: true,
  }),
});
assert.ok(imageNotes.note.summary.length > 0);
await json(`/api/lectures/${lecture.id}/images/${imageUpload.image.id}`, {
  method: "DELETE",
});
const withoutImage = await json(`/api/lectures/${lecture.id}`);
assert.equal(withoutImage.lecture.images.length, 0);

const fakeAudio = Buffer.alloc(2048, 7);
const upload = await json(`/api/lectures/${lecture.id}/audio`, {
  method: "POST",
  headers: { "Content-Type": "audio/webm" },
  body: fakeAudio,
});
assert.equal(upload.ok, true);

const audioResponse = await fetch(`${BASE}/api/lectures/${lecture.id}/audio`, {
  headers: { Cookie: cookie },
});
assert.equal(audioResponse.status, 200);
assert.equal(audioResponse.headers.get("content-type"), "audio/webm");
const audioBytes = Buffer.from(await audioResponse.arrayBuffer());
assert.equal(audioBytes.length, 2048);

const detail = await json(`/api/lectures/${lecture.id}`);
assert.equal(detail.lecture.note.source, "local");
assert.equal(detail.lecture.chat.some((message) => message.role === "assistant"), true);

const profileResult = await json(`/api/courses/${courseId}/teacher-profile`, {
  method: "POST",
});
assert.equal(profileResult.profile.source, "local");
assert.equal(profileResult.profile.teacher, "测试老师");
assert.equal(profileResult.profile.dimensions.length, 5);
assert.ok(profileResult.profile.advice.before.length > 0);
assert.ok(profileResult.profile.advice.during.length > 0);
assert.ok(profileResult.profile.advice.after.length > 0);
assert.ok(profileResult.profile.noteStrategy.length > 0);

const courseWithProfile = await json(`/api/courses/${courseId}`);
assert.equal(courseWithProfile.teacherProfile.teacher, "测试老师");

await json(`/api/lectures/${lecture.id}`, { method: "DELETE" });
const missing = await request(`/api/lectures/${lecture.id}`);
assert.equal(missing.response.status, 404);
await json(`/api/courses/${courseId}`, { method: "DELETE" });

console.log(
  "✓ 登录、课程、转写、实时纪要、流式问答、老师画像、归档、音频与删除全部通过",
);
