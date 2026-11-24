import { decryptSecret } from "./auth.mjs";
import {
  analyzeLocal,
  buildLocalSection,
  buildTeacherProfileLocal,
} from "./analyzer.mjs";
import { localDiagram, normalizeDiagram } from "./diagram.mjs";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function completionUrl(baseUrl) {
  const clean = normalizeBaseUrl(baseUrl);
  if (/\/chat\/completions$/i.test(clean)) return clean;
  return `${clean}/chat/completions`;
}

export function readLlmConfig(user) {
  const llm = user?.settings?.llm || {};
  const baseUrl = normalizeBaseUrl(llm.baseUrl);
  const model = String(llm.model || "").trim();
  return {
    provider: llm.provider || "custom",
    baseUrl,
    model,
    apiKey: decryptSecret(llm.apiKeyEnc),
    configured: Boolean(baseUrl && model),
    hasApiKey: Boolean(llm.apiKeyEnc),
    apiKeyLast4: llm.apiKeyLast4 || "",
  };
}

function authHeaders(config) {
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  return headers;
}

function timeoutSignal(ms, external) {
  const timeout = AbortSignal.timeout(ms);
  if (!external) return timeout;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([external, timeout]);
  return timeout;
}

async function readError(response) {
  try {
    const text = await response.text();
    const clean = text.replace(/\s+/g, " ").trim().slice(0, 300);
    return clean || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function extractJson(content) {
  if (!content || typeof content !== "string") throw new Error("模型返回为空");
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回可解析的 JSON");
  return JSON.parse(trimmed.slice(start, end + 1));
}

function stringArray(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const clean = item.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    const short = clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
    if (!result.includes(short)) result.push(short);
    if (result.length >= maxItems) break;
  }
  return result;
}

function normalizeSection(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const summary =
    typeof raw.summary === "string" ? raw.summary.replace(/\s+/g, " ").trim() : "";
  if (!summary) return null;

  const title =
    typeof raw.title === "string" ? raw.title.replace(/\s+/g, " ").trim() : "";
  const points = stringArray(raw.points, 6, 64);
  return {
    title: (title || "本段概要").slice(0, 32),
    summary: summary.slice(0, 380),
    points,
  };
}

function normalizeNote(raw, source = "ai", sectionText = "") {
  const summary = typeof raw?.summary === "string" ? raw.summary.replace(/\s+/g, " ").trim() : "";
  const keyPoints = stringArray(raw?.keyPoints, 6, 76);
  const keywords = stringArray(raw?.keywords, 8, 24);
  const questions = stringArray(raw?.questions, 4, 80);
  if (!summary && !keyPoints.length) throw new Error("模型返回的纪要结构不完整");

  // Models sometimes skip the `section` field. Rather than reuse the global
  // summary, derive a section from the new transcript slice so every update
  // still gets its own detailed paragraph.
  const section =
    normalizeSection(raw?.section) ||
    (sectionText ? buildLocalSection(sectionText, keywords) : null) || {
      title: "本段概要",
      summary: summary || keyPoints[0] || "",
      points: keyPoints.slice(0, 4),
    };

  return {
    summary: summary.slice(0, 360) || keyPoints[0] || "",
    keyPoints,
    keywords,
    questions,
    section,
    updatedAt: new Date().toISOString(),
    source,
  };
}

function incrementalPrompt(previous, newText, hasImages = false) {
  const summary = previous?.summary
    ? String(previous.summary).slice(0, 360)
    : "暂无";
  const points = Array.isArray(previous?.keyPoints) && previous.keyPoints.length
    ? previous.keyPoints.slice(0, 6).map((point) => `- ${point}`).join("\n")
    : "暂无";
  const sectionTitles =
    Array.isArray(previous?.sections) && previous.sections.length
      ? previous.sections
          .slice(-6)
          .map((section, index) => `- 第 ${section.index || index + 1} 段：${section.title || "未命名"}`)
          .join("\n")
      : "暂无";
  return [
    "你是课堂纪要整理助手。请把新增转写整理成分层、可读的中文纪要，供学生课后复习。",
    "写作要求：",
    "1. 全局摘要 180–280 字：概括整堂课截至目前的主线、关键概念与结论，写成一段连贯的话，不要只罗列短句。",
    "2. 分段摘要 200–320 字：只写【新增课堂转写】这一段。按“这一段在讲什么 → 概念如何展开（定义、例子、推导）→ 得出什么结论”来写，保留老师的关键说法和例子，不要压缩成一句话。",
    "3. 分段要点 3–5 条：每条 18–48 字，脱离上下文也能读懂。",
    "4. 全局要点 4–6 条；关键词 5–8 个；值得追问 3–4 个。",
    "5. 只使用转写和图片中确实出现的信息，不要编造；不要评价老师。",
    "只输出 JSON，且只输出 JSON，不要 Markdown 代码围栏。",
    '{"summary":"...","keyPoints":["..."],"keywords":["..."],"questions":["..."],"section":{"title":"8–16 字的段落标题","summary":"...","points":["..."]}}',
    hasImages
      ? "随附图片可能是板书、PPT 或教材。只提取清晰可辨的文字和结构，写进分段摘要；看不清不要猜。如果本轮没有新增文字，分段摘要就写图片内容。"
      : "",
    "",
    "【已有全局摘要】",
    summary,
    "",
    "【已有的分段标题】",
    sectionTitles,
    "",
    "【已有要点】",
    points,
    "",
    "【新增课堂转写】",
    newText.slice(-10_000) || "（本轮没有新增文字，只有图片）",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function imageParts(images = []) {
  return images
    .filter((image) => image?.data?.length)
    .map((image) => ({
      type: "image_url",
      image_url: {
        url: `data:${image.mime || "image/jpeg"};base64,${Buffer.from(image.data).toString("base64")}`,
      },
    }));
}

function userContent(text, images = []) {
  const parts = imageParts(images);
  if (!parts.length) return text;
  return [{ type: "text", text }, ...parts];
}

async function requestNotes(config, prompt, images = [], sectionText = "") {
  const response = await fetch(completionUrl(config.baseUrl), {
    method: "POST",
    headers: authHeaders(config),
    body: JSON.stringify({
      model: config.model,
      temperature: 0.28,
      max_tokens: 2200,
      messages: [
        {
          role: "system",
          content:
            "你是课堂纪要整理助手，擅长把课堂转写整理成分层、可读的中文纪要。只输出 JSON。",
        },
        {
          role: "user",
          content: userContent(prompt, images),
        },
      ],
    }),
    signal: timeoutSignal(60_000),
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  return normalizeNote(extractJson(content), "ai", sectionText);
}

export async function analyzeWithModel(
  user,
  { newText = "", fullText = "", previous = null, images = [] } = {},
) {
  const config = readLlmConfig(user);
  if (!config.configured) {
    return {
      note: analyzeLocal(fullText || newText, { newText }),
      source: "local",
    };
  }

  const prompt = incrementalPrompt(previous, newText, images.length > 0);
  const sectionText = String(newText || "").trim();
  try {
    const note = await requestNotes(config, prompt, images, sectionText);
    return { note, source: "ai" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "未知错误";
    if (images.length) {
      try {
        const note = await requestNotes(config, prompt, [], sectionText);
        return {
          note,
          source: "ai",
          warning: "当前模型不支持图片分析，本轮摘要只基于文字更新。",
        };
      } catch (fallbackError) {
        console.warn(
          `[llm] 图片摘要与文字重试均失败：${(fallbackError instanceof Error ? fallbackError.message : reason).slice(0, 180)}`,
        );
      }
    }
    console.warn(`[llm] 增量摘要失败，已回退本地：${reason.slice(0, 180)}`);
    return {
      note: analyzeLocal(fullText || newText, { newText }),
      source: "local",
      warning: "AI 服务暂时不可用，已自动切换到本地纪要。",
    };
  }
}

function diagramPrompt({ title, summary, points = [], keywords = [] }) {
  const pointList = Array.isArray(points) && points.length
    ? points.slice(0, 6).map((point) => `- ${point}`).join("\n")
    : "暂无";
  return [
    "你是课堂逻辑图设计助手。请把下面这段课堂摘要整理成一张“逻辑示意图”的数据结构，用于渲染成树状图。",
    "要求：",
    "1. 中心主题是这段内容的核心问题或结论，12–24 字。",
    "2. 3–6 条主分支，按讲解推进顺序排列，每条 8–18 字，代表一个逻辑环节，例如“问题提出”“机制解释”“案例验证”“结论与启示”。",
    "3. 每条主分支下 0–3 个子节点，每条 6–22 字，写具体概念、例子或结论。",
    "4. 文字必须来自摘要和要点，不要引入新事实；不要写“第一、第二”这类空话。",
    "只输出 JSON，且只输出 JSON，不要 Markdown 代码围栏。",
    '{"title":"...","root":{"label":"...","detail":"..."},"branches":[{"label":"...","detail":"...","children":[{"label":"...","detail":"..."}]}]}',
    "",
    `【标题】${title || "课堂内容"}`,
    "",
    "【摘要】",
    summary || "暂无",
    "",
    "【要点】",
    pointList,
    "",
    "【关键词】",
    Array.isArray(keywords) && keywords.length ? keywords.join("、") : "暂无",
  ].join("\n");
}

export async function generateDiagramWithModel(
  user,
  { title = "", summary = "", points = [], keywords = [] } = {},
) {
  const fallback = localDiagram({ title, summary, points, keywords });
  const config = readLlmConfig(user);
  if (!config.configured) {
    return { diagram: fallback, source: "local" };
  }

  try {
    const response = await fetch(completionUrl(config.baseUrl), {
      method: "POST",
      headers: authHeaders(config),
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          {
            role: "system",
            content:
              "你是严谨的课堂逻辑图设计助手，只输出可直接解析的 JSON。",
          },
          {
            role: "user",
            content: diagramPrompt({ title, summary, points, keywords }),
          },
        ],
      }),
      signal: timeoutSignal(50_000),
    });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json();
    const diagram = normalizeDiagram(
      extractJson(data?.choices?.[0]?.message?.content),
      title,
    );
    if (!diagram) throw new Error("模型返回的逻辑图结构不完整");
    return { diagram: { ...diagram, source: "ai" }, source: "ai" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "未知错误";
    console.warn(`[llm] 逻辑图生成失败，已回退本地：${reason.slice(0, 180)}`);
    return {
      diagram: fallback,
      source: "local",
      warning: "AI 暂时不可用，已用本地规则梳理逻辑图。",
    };
  }
}

function normalizeTeacherProfile(raw, fallback) {
  if (!raw || typeof raw !== "object" || !raw.summary) {
    throw new Error("模型返回的老师画像结构不完整");
  }
  const summary = String(raw.summary).replace(/\s+/g, " ").trim().slice(0, 320);
  const tags = stringArray(raw.tags, 6, 20);
  const dims = fallback.dimensions.map((base) => {
    const candidate = Array.isArray(raw.dimensions)
      ? raw.dimensions.find(
          (item) =>
            item &&
            typeof item === "object" &&
            (item.key === base.key || item.label === base.label),
        )
      : null;
    const value =
      candidate && typeof candidate.summary === "string"
        ? candidate.summary.replace(/\s+/g, " ").trim().slice(0, 160)
        : "";
    return { ...base, summary: value || base.summary };
  });
  const strengths = stringArray(raw.strengths, 4, 110);
  const attentionPoints = stringArray(raw.attentionPoints, 4, 110);
  const noteStrategy =
    typeof raw.noteStrategy === "string" ? raw.noteStrategy.trim().slice(0, 220) : "";
  const advice = {
    before: stringArray(raw.advice?.before, 4, 120),
    during: stringArray(raw.advice?.during, 4, 120),
    after: stringArray(raw.advice?.after, 4, 120),
  };
  const evidence = stringArray(raw.evidence, 3, 130);

  return {
    ...fallback,
    summary,
    tags: tags.length >= 2 ? tags : fallback.tags,
    dimensions: dims,
    strengths: strengths.length ? strengths : fallback.strengths,
    attentionPoints: attentionPoints.length
      ? attentionPoints
      : fallback.attentionPoints,
    noteStrategy: noteStrategy || fallback.noteStrategy,
    advice: {
      before: advice.before.length ? advice.before : fallback.advice.before,
      during: advice.during.length ? advice.during : fallback.advice.during,
      after: advice.after.length ? advice.after : fallback.advice.after,
    },
    evidence: evidence.length ? evidence : fallback.evidence,
    source: "ai",
    updatedAt: new Date().toISOString(),
  };
}

function teacherProfilePrompt(course, lectures, text, fallback) {
  const minutes = Math.round(fallback.durationSeconds / 60);
  const wordsPerMinute = Math.round(
    fallback.transcriptChars / Math.max(1, fallback.durationSeconds / 60),
  );
  const paceReliable =
    fallback.durationSeconds > 0 &&
    fallback.transcriptChars >= 800 &&
    wordsPerMinute >= 60;
  const lectureIndex = lectures
    .map(
      (lecture, index) =>
        `${index + 1}. ${lecture.title}（${Math.round((lecture.durationSec || 0) / 60)} 分钟）`,
    )
    .join("\n");
  const clipped =
    text.length > 28_000
      ? `${text.slice(0, 3200)}\n…（中间内容略）…\n${text.slice(-24_000)}`
      : text;
  return [
    "你是一名教学观察与学习策略助手。请基于老师多堂课的文字转写，提炼可观察的讲课方式，并给出学生可执行的听课建议。",
    "重要边界：只描述讲解结构、节奏、举例方式、互动方式、重点呈现等可观察行为；不要评价老师的人格、能力或教学水平；不要使用贬义判断；不要编造转写里没有的事实。",
    "请输出 JSON，且只输出 JSON，不要 Markdown 代码围栏。结构如下：",
    '{"summary":"2到3句话的课堂风格概述","tags":["4到6个短标签"],"dimensions":[{"key":"structure","label":"讲解结构","summary":"..."},{"key":"pace","label":"节奏密度","summary":"..."},{"key":"examples","label":"举例方式","summary":"..."},{"key":"interaction","label":"互动风格","summary":"..."},{"key":"emphasis","label":"重点呈现","summary":"..."}],"strengths":["2到4条课堂优势"],"attentionPoints":["2到4条学生需要留意的听课难点"],"noteStrategy":"一句话笔记策略","advice":{"before":["课前建议"],"during":["课中建议"],"after":["课后建议"]},"evidence":["最多3条，引用转写中的短句，并标注来自哪堂课"]}',
    "所有建议都要具体、可执行，面向学生，而不是对老师提出改进意见。",
    "",
    `课程：${course.name}`,
    `老师：${course.teacher}`,
    `课堂数量：${fallback.lectureCount}`,
    `累计时长：约 ${minutes} 分钟`,
    `转写字数：约 ${fallback.transcriptChars}`,
    paceReliable
      ? `平均语速：约 ${wordsPerMinute} 字/分钟`
      : "平均语速：转写样本较短，无法可靠计算，请不要据此推断节奏快慢",
    "",
    "课堂列表：",
    lectureIndex,
    "",
    "【课堂转写】",
    clipped,
  ].join("\n");
}

export async function analyzeTeacherProfileWithModel(user, course, lectures, text) {
  const fallback = buildTeacherProfileLocal(course, lectures);
  const config = readLlmConfig(user);
  if (!config.configured) {
    return { profile: fallback, source: "local" };
  }

  try {
    const response = await fetch(completionUrl(config.baseUrl), {
      method: "POST",
      headers: authHeaders(config),
      body: JSON.stringify({
        model: config.model,
        temperature: 0.3,
        max_tokens: 2200,
        messages: [
          {
            role: "system",
            content:
              "你是严谨的教学观察助手，擅长把课堂转写转化为中性的讲课风格画像和可执行的学习策略。",
          },
          {
            role: "user",
            content: teacherProfilePrompt(course, lectures, text, fallback),
          },
        ],
      }),
      signal: timeoutSignal(50_000),
    });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const profile = normalizeTeacherProfile(extractJson(content), fallback);
    return { profile, source: "ai" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "未知错误";
    console.warn(`[llm] 老师画像生成失败，已回退本地：${reason.slice(0, 180)}`);
    return {
      profile: fallback,
      source: "local",
      warning: "AI 服务暂时不可用，已使用本地课堂特征生成画像。",
    };
  }
}

export async function testConnection(user) {
  const config = readLlmConfig(user);
  if (!config.configured) {
    return { ok: false, message: "请先填写 API 地址和模型名称。" };
  }
  try {
    const response = await fetch(completionUrl(config.baseUrl), {
      method: "POST",
      headers: authHeaders(config),
      body: JSON.stringify({
        model: config.model,
        max_tokens: 12,
        temperature: 0,
        messages: [{ role: "user", content: "只回复：连接成功" }],
      }),
      signal: timeoutSignal(20_000),
    });
    if (!response.ok) {
      return { ok: false, message: `连接失败：${await readError(response)}` };
    }
    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || "";
    return {
      ok: true,
      message: reply ? `连接成功 · 模型回复：${String(reply).trim().slice(0, 40)}` : "连接成功",
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "网络错误";
    return { ok: false, message: `连接失败：${reason.slice(0, 220)}` };
  }
}

function lectureContext(lecture, text) {
  const clean = String(text || "").trim();
  const context =
    clean.length > 18_000 ? `${clean.slice(0, 2500)}\n…（中间内容略）…\n${clean.slice(-15_000)}` : clean;
  const note = lecture.note || {};
  const sections = Array.isArray(note.sections)
    ? note.sections
        .slice(-6)
        .map((section) => `${section.title || "分段摘要"}：${String(section.summary || "").slice(0, 180)}`)
        .join("\n")
    : "";
  const notes = [
    note.summary ? `摘要：${note.summary}` : "",
    sections ? `分段摘要：\n${sections}` : "",
    Array.isArray(note.keyPoints) && note.keyPoints.length
      ? `要点：\n${note.keyPoints.map((point) => `- ${point}`).join("\n")}`
      : "",
    Array.isArray(note.keywords) && note.keywords.length
      ? `关键词：${note.keywords.join("、")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  return `课程：${lecture.courseName || ""}\n老师：${lecture.teacher || ""}\n\n【当前纪要】\n${notes || "暂无"}\n\n【课堂转写】\n${context || "暂无转写内容"}`;
}

export function buildChatMessages(lecture, text, history, question, images = []) {
  const messages = [
    {
      role: "system",
      content: [
        "你是「聆记」的随堂助教，帮助学生在听课过程中理解内容。",
        "回答必须优先依据提供的课堂转写、纪要和板书图片。",
        "如果课堂没有直接讲到，要明确说“课堂中暂未直接提到”，再给出标注为“补充”的一般性解释。",
        "回答使用中文，简洁清楚；需要时用小标题或短列表。不要编造老师的原话。",
        "如果学生的提问与课堂无关，可以简短回答，但要提醒与当前课程的关联。",
        "如果随附了图片，只使用清晰可辨的信息，不要猜测看不清的内容。",
        "",
        lectureContext(lecture, text),
      ].join("\n"),
    },
    ...history.slice(-10).map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content || "").slice(0, 2500),
    })),
  ];
  const parts = imageParts(images);
  if (parts.length) {
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: "以下图片是本节课的板书、幻灯片或教材，请把它们作为课堂上下文理解，不构成新的问题。",
        },
        ...parts,
      ],
    });
  }
  messages.push({ role: "user", content: question });
  return messages;
}

export async function streamChatCompletion(user, messages, onDelta, externalSignal) {
  const config = readLlmConfig(user);
  if (!config.configured) throw new Error("尚未配置模型 API");

  const response = await fetch(completionUrl(config.baseUrl), {
    method: "POST",
    headers: authHeaders(config),
    body: JSON.stringify({
      model: config.model,
      temperature: 0.45,
      max_tokens: 1400,
      stream: true,
      messages,
    }),
    signal: timeoutSignal(90_000, externalSignal),
  });

  if (!response.ok) throw new Error(await readError(response));

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    if (!content) throw new Error("模型没有返回内容");
    onDelta(content);
    return content;
  }

  if (!response.body) throw new Error("模型没有返回响应流");

  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  const handleLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const parsed = JSON.parse(payload);
      const delta =
        parsed?.choices?.[0]?.delta?.content ??
        parsed?.choices?.[0]?.message?.content ??
        "";
      if (typeof delta === "string" && delta) {
        full += delta;
        onDelta(delta);
      }
    } catch {
      // Providers occasionally send keep-alive comments; ignore malformed chunks.
    }
  };

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) handleLine(line);
  }
  buffer += decoder.decode();
  if (buffer) handleLine(buffer);

  if (!full.trim()) throw new Error("模型返回了空内容");
  return full;
}
