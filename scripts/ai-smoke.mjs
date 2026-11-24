import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4173";
const MOCK_PORT = 4199;
let cookie = "";

const mockProfile = {
  summary: "这是一段由测试模型生成的课堂画像摘要，用于验证 AI 路径。",
  tags: ["结构清晰", "案例驱动", "重点突出", "互动启发"],
  dimensions: [
    {
      key: "structure",
      label: "讲解结构",
      summary: "测试模型认为课堂有清晰的问题—案例—结论结构。",
    },
  ],
  strengths: ["用案例推进概念", "重点句清晰"],
  attentionPoints: ["信息密度较高，需要留出整理时间"],
  noteStrategy: "用「概念—案例—结论」三栏记录。",
  advice: {
    before: ["课前浏览关键词"],
    during: ["先记结构，再补细节"],
    after: ["当天复述一次"],
  },
  evidence: ["测试引用：重点是区分选择的自由与被设计的选择集。"],
};

const mockRequests = [];
const mock = http.createServer((req, res) => {
  if (req.url?.endsWith("/chat/completions") && req.method === "POST") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const payload = JSON.parse(raw);
      mockRequests.push(payload);
      const prompt = JSON.stringify(payload);
      const content = prompt.includes("课堂逻辑图设计助手")
        ? {
            title: "注意力如何被重新组织",
            root: {
              label: "注意力如何被重新组织",
              detail: "推荐系统把注意力拆成可计算的行为指标。",
            },
            branches: [
              {
                label: "争夺对象改变",
                detail: "从曝光时段转向下一次停留。",
                children: [
                  { label: "停留与互动成为推荐材料", detail: "" },
                  { label: "行为被拆成可计算指标", detail: "" },
                ],
              },
              {
                label: "自由选择的悖论",
                detail: "选项本身已经被个性化排序。",
                children: [
                  { label: "区分选择自由与被设计的选择集", detail: "" },
                ],
              },
            ],
          }
        : prompt.includes("课堂纪要整理助手")
          ? {
              summary:
                "这是更新后的全局摘要，用来验证分层纪要路径：平台通过推荐系统重新组织注意力，用户的停留与互动成为下一次推荐的材料，而所谓自由选择其实发生在被设计的选择集之内。",
              keyPoints: ["推荐系统争夺的是下一次停留", "注意力被拆成可计算指标"],
              keywords: ["注意力经济", "推荐算法", "选择集"],
              questions: ["被设计的选择集如何影响公共讨论？"],
              section: {
                title: "注意力与选择集",
                summary:
                  "这一段先说明推荐系统如何把注意力拆成可计算的行为指标，再用“选择的自由与被设计的选择集”指出用户所处的结构性处境，最后把问题推向公共讨论的质量。",
                points: ["推荐系统争夺下一次停留", "行为指标取代心理状态", "自由选择发生在被设计的选项里"],
              },
            }
          : mockProfile;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify(content),
              },
            },
          ],
        }),
      );
    });
    return;
  }
  res.writeHead(404).end();
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
  const originalSettings = (await request("/api/settings")).body.llm;
  assert.equal(
    originalSettings.hasApiKey,
    false,
    "该测试会替换模型设置，请只在没有保存 API Key 的演示账号上运行。",
  );

  const saved = await request("/api/settings", {
    method: "PUT",
    body: JSON.stringify({
      provider: "custom",
      baseUrl: `http://127.0.0.1:${MOCK_PORT}/v1`,
      model: "mock-teacher-model",
      apiKey: "mock-key",
    }),
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.llm.configured, true);

  const course = await request("/api/courses", {
    method: "POST",
    body: JSON.stringify({ name: `AI 画像测试 ${Date.now()}`, teacher: "测试老师" }),
  });
  const courseId = course.body.course.id;
  const lecture = await request("/api/lectures", {
    method: "POST",
    body: JSON.stringify({ courseId }),
  });
  const lectureId = lecture.body.lecture.id;
  const firstSegments = [
    {
      id: "ai-1",
      text: "旧内容：今天讨论注意力经济。平台通过推荐算法决定用户看到什么内容，例如每一次停留都会影响下一次推荐。",
      at: 8,
    },
    {
      id: "ai-2",
      text: "旧内容续：用户以为自己在自由选择，但选项本身已经被设计。我们需要区分选择的自由和被设计的选择集。",
      at: 26,
    },
  ];
  await request(`/api/lectures/${lectureId}/transcript`, {
    method: "PUT",
    body: JSON.stringify({ segments: firstSegments }),
  });

  const firstNotes = await request(`/api/lectures/${lectureId}/notes`, {
    method: "POST",
    body: JSON.stringify({
      text: firstSegments.map((segment) => segment.text).join(""),
    }),
  });
  assert.equal(firstNotes.response.status, 200);
  assert.equal(firstNotes.body.source, "ai");
  assert.equal(
    firstNotes.body.note.summary,
    "这是更新后的全局摘要，用来验证分层纪要路径：平台通过推荐系统重新组织注意力，用户的停留与互动成为下一次推荐的材料，而所谓自由选择其实发生在被设计的选择集之内。",
  );
  assert.equal(mockRequests.at(-1).max_tokens, 2200);
  assert.ok(JSON.stringify(mockRequests.at(-1)).includes("旧内容"));
  assert.equal(firstNotes.body.note.sections.length, 1);
  assert.equal(firstNotes.body.note.sections[0].title, "注意力与选择集");
  assert.ok(firstNotes.body.note.sections[0].summary.length > 30);
  assert.ok(firstNotes.body.note.sections[0].points.length >= 2);
  assert.equal(firstNotes.body.note.section, undefined, "分段草稿不应直接回传给前端");

  const newSegment = {
    id: "ai-3",
    text: "新增内容：算法优化停留时长，并不等于优化用户的长期福祉。",
    at: 48,
  };
  await request(`/api/lectures/${lectureId}/transcript`, {
    method: "PUT",
    body: JSON.stringify({ segments: [...firstSegments, newSegment] }),
  });
  const secondNotes = await request(`/api/lectures/${lectureId}/notes`, {
    method: "POST",
    body: JSON.stringify({
      text: [...firstSegments, newSegment].map((segment) => segment.text).join(""),
    }),
  });
  assert.equal(secondNotes.response.status, 200);
  const secondPrompt = JSON.stringify(mockRequests.at(-1));
  assert.ok(secondPrompt.includes("新增内容"));
  assert.ok(!secondPrompt.includes("旧内容：今天讨论注意力经济"));
  assert.ok(secondPrompt.includes("这是更新后的全局摘要"));
  assert.ok(secondPrompt.includes("注意力与选择集"));
  assert.equal(secondNotes.body.note.keywords.length, 3);
  assert.equal(secondNotes.body.note.sections.length, 2, "每次更新都应追加一段摘要");

  const overallDiagram = await request(`/api/lectures/${lectureId}/diagram`, {
    method: "POST",
    body: JSON.stringify({ scope: "overall" }),
  });
  assert.equal(overallDiagram.response.status, 200);
  assert.equal(overallDiagram.body.source, "ai");
  assert.equal(overallDiagram.body.diagram.branches.length, 2);
  assert.equal(overallDiagram.body.diagram.branches[0].children.length, 2);

  const cachedDiagram = await request(`/api/lectures/${lectureId}/diagram`, {
    method: "POST",
    body: JSON.stringify({ scope: "overall" }),
  });
  assert.equal(cachedDiagram.body.cached, true, "相同摘要的逻辑图应命中缓存");

  const sectionDiagram = await request(`/api/lectures/${lectureId}/diagram`, {
    method: "POST",
    body: JSON.stringify({
      scope: "section",
      sectionId: secondNotes.body.note.sections[0].id,
    }),
  });
  assert.equal(sectionDiagram.response.status, 200);
  assert.equal(sectionDiagram.body.source, "ai");

  const uploaded = await request(`/api/lectures/${lectureId}/images`, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: fs.readFileSync("build/icon.png"),
  });
  assert.equal(uploaded.response.status, 201);
  const imageNotes = await request(`/api/lectures/${lectureId}/notes`, {
    method: "POST",
    body: JSON.stringify({
      text: [...firstSegments, newSegment].map((segment) => segment.text).join(""),
      forceImages: true,
    }),
  });
  assert.equal(imageNotes.response.status, 200);
  const imagePrompt = JSON.stringify(mockRequests.at(-1));
  assert.ok(imagePrompt.includes('"type":"image_url"'));
  assert.ok(imagePrompt.includes("data:image/png;base64,"));
  await request(`/api/lectures/${lectureId}/images/${uploaded.body.image.id}`, {
    method: "DELETE",
  });

  await request(`/api/lectures/${lectureId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed", durationSec: 90 }),
  });

  const profile = await request(`/api/courses/${courseId}/teacher-profile`, {
    method: "POST",
  });
  assert.equal(profile.response.status, 200);
  assert.equal(profile.body.profile.source, "ai");
  assert.equal(profile.body.profile.summary, mockProfile.summary);
  assert.deepEqual(profile.body.profile.tags, mockProfile.tags);
  assert.equal(profile.body.profile.dimensions.length, 5);
  assert.equal(
    profile.body.profile.dimensions[0].summary,
    mockProfile.dimensions[0].summary,
  );
  assert.equal(profile.body.profile.advice.before[0], "课前浏览关键词");

  await request(`/api/courses/${courseId}`, { method: "DELETE" });
  const restored = await request("/api/settings", {
    method: "PUT",
    body: JSON.stringify({
      provider: originalSettings.provider,
      baseUrl: originalSettings.baseUrl,
      model: originalSettings.model,
      clearApiKey: !originalSettings.hasApiKey,
    }),
  });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.llm.configured, originalSettings.configured);

  console.log("✓ 自有 API 的老师画像生成、JSON 规范化与设置恢复全部通过");
} finally {
  mock.close();
}
