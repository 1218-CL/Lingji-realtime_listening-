import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  APP_SECRET,
  AUDIO_DIR,
  COOKIE_NAME,
  DIST_DIR,
  HOST,
  IMAGES_DIR,
  IS_DEV,
  MAX_AUDIO_BYTES,
  MAX_TRANSCRIPT_CHARS,
  PORT,
  SEED_DEMO,
} from "./config.mjs";
import { checkForUpdates } from "./updates.mjs";
import { readAsrConfig, transcribeAudio } from "./asr.mjs";
import {
  ensureImageDir,
  loadImagesForModel,
  MAX_LECTURE_IMAGES,
  MAX_MODEL_IMAGES,
  publicImage,
  removeImagesForLecture,
} from "./images.mjs";
import { Store } from "./store.mjs";
import {
  clearSessionCookie,
  createSession,
  encryptSecret,
  getSessionUser,
  hashPassword,
  publicUser,
  setSessionCookie,
  tokenHash,
  verifyPassword,
} from "./auth.mjs";
import { answerLocally } from "./analyzer.mjs";
import { summarySignature } from "./diagram.mjs";
import {
  analyzeTeacherProfileWithModel,
  analyzeWithModel,
  buildChatMessages,
  generateDiagramWithModel,
  readLlmConfig,
  streamChatCompletion,
  testConnection,
} from "./llm.mjs";
import { seedDemo } from "./seed.mjs";

const store = new Store().load();
if (SEED_DEMO) await seedDemo(store);

const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "microphone=(self)");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));

const COURSE_COLORS = ["#027789", "#D97757", "#2D6CDF", "#7A5AF8", "#2F8F6B", "#B7791F"];

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

function text(value, { min = 0, max = 200 } = {}) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (clean.length < min || clean.length > max) return null;
  return clean;
}

function asLimit(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const user = getSessionUser(store.db, token);
  if (!user) return fail(res, 401, "请先登录后再继续。");
  req.user = user;
  req.sessionToken = token;
  next();
}

function makeLimiter(windowMs, max) {
  const buckets = new Map();
  return (req, res, next) => {
    const key = `${req.ip || "local"}:${req.path}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const seconds = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(seconds));
      return fail(res, 429, `请求太频繁，请 ${seconds} 秒后再试。`);
    }
    next();
  };
}

const authLimiter = makeLimiter(10 * 60 * 1000, 30);
const aiLimiter = makeLimiter(60 * 1000, 40);
const noteInFlight = new Set();
const diagramInFlight = new Set();
const teacherProfileInFlight = new Set();

function getUserCourses(userId) {
  return store.db.courses.filter((course) => course.userId === userId);
}

function getCourse(userId, courseId) {
  return store.db.courses.find((course) => course.id === courseId && course.userId === userId);
}

function getLecture(userId, lectureId) {
  return store.db.lectures.find(
    (lecture) => lecture.id === lectureId && lecture.userId === userId,
  );
}

/**
 * Older notes only had one global summary. Materialize a single section for
 * them so the review UI and the diagram endpoint can treat all notes the same.
 */
function ensureNoteSections(note) {
  if (!note) return [];
  if (Array.isArray(note.sections) && note.sections.length) return note.sections;
  if (!note.summary && !(note.keyPoints || []).length) return [];
  return [
    {
      id: "legacy",
      index: 1,
      title: "整堂概要",
      summary: note.summary || "",
      points: Array.isArray(note.keyPoints) ? note.keyPoints.slice(0, 5) : [],
      startSec: 0,
      endSec: 0,
      chars: 0,
      createdAt: note.updatedAt || new Date().toISOString(),
    },
  ];
}

function noteView(note) {
  if (!note) return null;
  return { ...note, sections: ensureNoteSections(note) };
}

function sectionStartSeconds(lecture, cursor) {
  const segments = lecture.segments || [];
  let consumed = 0;
  for (const segment of segments) {
    const end = consumed + segment.text.length;
    if (end > cursor) return segment.at || 0;
    consumed = end;
  }
  return segments.length ? segments[segments.length - 1].at || 0 : 0;
}

function appendSection(lecture, previousSections, candidate, cursor, newText) {
  const sections = Array.isArray(previousSections) ? [...previousSections] : [];
  const lastIndex = sections.length
    ? Number(sections[sections.length - 1].index) || sections.length
    : 0;
  const index = lastIndex + 1;
  const segments = lecture.segments || [];
  const lastAt = segments.length ? segments[segments.length - 1].at || 0 : 0;
  const section = {
    id: crypto.randomUUID(),
    index,
    title: String(candidate?.title || `第 ${index} 段`).slice(0, 40),
    summary: String(candidate?.summary || ""),
    points: Array.isArray(candidate?.points)
      ? candidate.points.map((point) => String(point)).slice(0, 6)
      : [],
    startSec: sectionStartSeconds(lecture, cursor),
    endSec: Math.max(lastAt, Number(lecture.durationSec) || 0),
    chars: newText.length,
    createdAt: new Date().toISOString(),
  };
  sections.push(section);
  return sections.slice(-60);
}

function lectureSummary(lecture) {
  const course = store.db.courses.find((item) => item.id === lecture.courseId);
  return {
    id: lecture.id,
    courseId: lecture.courseId,
    courseName: course?.name || "未命名课程",
    teacher: course?.teacher || "",
    title: lecture.title,
    status: lecture.status,
    startedAt: lecture.startedAt,
    endedAt: lecture.endedAt || null,
    durationSec: lecture.durationSec || 0,
    note: noteView(lecture.note),
    hasAudio: Boolean(lecture.audio?.file),
    segmentCount: lecture.segments?.length || 0,
    imageCount: lecture.images?.length || 0,
  };
}

function lectureDetail(lecture) {
  const course = store.db.courses.find((item) => item.id === lecture.courseId);
  const segments = lecture.segments || [];
  const totalChars = segments.reduce((sum, segment) => sum + segment.text.length, 0);
  const cursor = Math.max(0, Number(lecture.summaryCursor) || 0);
  const imageSignature = (lecture.images || []).map((image) => image.id).join(",");
  return {
    ...lectureSummary(lecture),
    segments,
    images: (lecture.images || []).map((image) => publicImage(lecture.id, image)),
    summaryState: {
      cursor,
      pendingChars: Math.max(0, totalChars - cursor),
      pendingImages:
        Boolean(imageSignature) &&
        imageSignature !== (lecture.summaryImageSignature || ""),
    },
    chat: lecture.chat || [],
    course: course
      ? { id: course.id, name: course.name, teacher: course.teacher, color: course.color }
      : null,
  };
}

function courseSummary(course) {
  const lectures = store.db.lectures
    .filter((lecture) => lecture.courseId === course.id)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const totalSeconds = lectures.reduce((sum, lecture) => sum + (lecture.durationSec || 0), 0);
  const latest = lectures[0];
  const noteWithKeywords = lectures.find((lecture) => lecture.note?.keywords?.length);
  return {
    id: course.id,
    name: course.name,
    teacher: course.teacher,
    color: course.color,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
    lectureCount: lectures.length,
    totalSeconds,
    lastLectureAt: latest?.startedAt || null,
    latestLecture: latest ? lectureSummary(latest) : null,
    keywords: noteWithKeywords?.note?.keywords?.slice(0, 3) || [],
  };
}

function settingsView(user) {
  const config = readLlmConfig(user);
  const asr = readAsrConfig(user);
  return {
    llm: {
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      hasApiKey: config.hasApiKey,
      apiKeyLast4: config.apiKeyLast4,
      configured: config.configured,
    },
    asr: {
      enabled: asr.enabled,
      baseUrl: asr.baseUrl,
      model: asr.model,
      language: asr.language,
      hasApiKey: asr.hasApiKey,
      apiKeyLast4: asr.apiKeyLast4,
      configured: asr.configured,
    },
  };
}

const DUMMY_PASSWORD = hashPassword("not-a-real-password", "0".repeat(32));

// ---------------------------------------------------------------- health + auth

app.get("/api/health", (req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.get("/api/config", (req, res) => {
  res.json({
    demoAvailable: store.db.users.some(
      (user) => user.username === "demo" && user.isDemo,
    ),
  });
});

app.post("/api/auth/register", authLimiter, async (req, res, next) => {
  try {
    const username = text(req.body?.username, { min: 2, max: 24 });
    if (!username || !/^[\p{L}\p{N}_-]+$/u.test(username)) {
      return fail(res, 400, "用户名需为 2–24 位中文、字母、数字、下划线或短横线。");
    }
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (password.length < 6 || password.length > 72) {
      return fail(res, 400, "密码长度需在 6–72 位之间。");
    }
    const displayName = text(req.body?.displayName, { min: 1, max: 24 }) || username;
    if (store.db.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
      return fail(res, 409, "这个用户名已经被使用了。");
    }

    const passwordData = hashPassword(password);
    const user = {
      id: crypto.randomUUID(),
      username,
      displayName,
      passwordHash: passwordData.hash,
      salt: passwordData.salt,
      createdAt: new Date().toISOString(),
      settings: {
        llm: { provider: "deepseek", baseUrl: "", model: "", apiKeyEnc: "", apiKeyLast4: "" },
      },
    };

    let token = "";
    await store.update((db) => {
      db.users.push(user);
      token = createSession(db, user.id);
    });
    setSessionCookie(res, token);
    res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", authLimiter, async (req, res, next) => {
  try {
    const username = text(req.body?.username, { min: 1, max: 60 });
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!username || !password) return fail(res, 400, "请输入用户名和密码。");

    const user = store.db.users.find(
      (item) => item.username.toLowerCase() === username.toLowerCase(),
    );
    const valid = user
      ? verifyPassword(password, user.salt, user.passwordHash)
      : verifyPassword(password, DUMMY_PASSWORD.salt, DUMMY_PASSWORD.hash);
    if (!user || !valid) return fail(res, 401, "用户名或密码不正确。");

    let token = "";
    await store.update((db) => {
      token = createSession(db, user.id);
    });
    setSessionCookie(res, token);
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", async (req, res, next) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      const hashed = tokenHash(token);
      await store.update((db) => {
        db.sessions = db.sessions.filter((session) => session.tokenHash !== hashed);
      });
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", (req, res) => {
  const user = getSessionUser(store.db, req.cookies?.[COOKIE_NAME]);
  // This is a session probe rather than a protected resource: returning 200 with
  // null keeps the signed-out landing page free of noisy 401 console errors.
  res.json({ user: user ? publicUser(user) : null });
});

app.patch("/api/me", requireAuth, async (req, res, next) => {
  try {
    const displayName = text(req.body?.displayName, { min: 1, max: 24 });
    if (!displayName) return fail(res, 400, "昵称需为 1–24 个字符。");
    await store.update((db) => {
      const user = db.users.find((item) => item.id === req.user.id);
      if (user) user.displayName = displayName;
    });
    res.json({ user: publicUser({ ...req.user, displayName }) });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------------- settings

app.get("/api/settings", requireAuth, (req, res) => {
  res.json(settingsView(req.user));
});

app.put("/api/settings", requireAuth, async (req, res, next) => {
  try {
    const provider = text(req.body?.provider, { max: 40 }) || "custom";
    const baseUrl = text(req.body?.baseUrl, { max: 300 }) || "";
    const model = text(req.body?.model, { max: 100 }) || "";
    const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
    const clearApiKey = Boolean(req.body?.clearApiKey);

    if (baseUrl) {
      let parsed;
      try {
        parsed = new URL(baseUrl);
      } catch {
        return fail(res, 400, "API 地址格式不正确。");
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return fail(res, 400, "API 地址必须以 http:// 或 https:// 开头。");
      }
      if (parsed.username || parsed.password) {
        return fail(res, 400, "请不要把密钥写在 API 地址里。");
      }
    }
    if (apiKey.length > 500) return fail(res, 400, "API Key 过长。");

    const asrInput =
      req.body?.asr && typeof req.body.asr === "object" ? req.body.asr : null;
    let asrBaseUrl = "";
    let asrModel = "";
    let asrLanguage = "zh";
    let asrApiKey = "";
    let asrClearApiKey = false;
    let asrEnabled = false;
    if (asrInput) {
      asrBaseUrl = text(asrInput.baseUrl, { max: 300 }) || "";
      asrModel = text(asrInput.model, { max: 100 }) || "";
      asrLanguage = text(asrInput.language, { max: 20 }) || "zh";
      asrApiKey = typeof asrInput.apiKey === "string" ? asrInput.apiKey.trim() : "";
      asrClearApiKey = Boolean(asrInput.clearApiKey);
      asrEnabled = Boolean(asrInput.enabled);
      if (asrBaseUrl) {
        let parsed;
        try {
          parsed = new URL(asrBaseUrl);
        } catch {
          return fail(res, 400, "语音识别 API 地址格式不正确。");
        }
        if (!["http:", "https:"].includes(parsed.protocol)) {
          return fail(res, 400, "语音识别 API 地址必须以 http:// 或 https:// 开头。");
        }
        if (parsed.username || parsed.password) {
          return fail(res, 400, "请不要把密钥写在语音识别 API 地址里。");
        }
      }
      if (asrApiKey.length > 500) return fail(res, 400, "语音识别 API Key 过长。");
    }

    await store.update((db) => {
      const user = db.users.find((item) => item.id === req.user.id);
      if (!user) return;
      user.settings = user.settings || {};
      const current = user.settings.llm || {};
      const nextLlm = {
        provider,
        baseUrl: baseUrl.replace(/\/+$/, ""),
        model,
        apiKeyEnc: current.apiKeyEnc || "",
        apiKeyLast4: current.apiKeyLast4 || "",
      };
      if (clearApiKey) {
        nextLlm.apiKeyEnc = "";
        nextLlm.apiKeyLast4 = "";
      } else if (apiKey) {
        nextLlm.apiKeyEnc = encryptSecret(apiKey);
        nextLlm.apiKeyLast4 = apiKey.slice(-4);
      }
      user.settings.llm = nextLlm;

      if (asrInput) {
        const currentAsr = user.settings.asr || {};
        const nextAsr = {
          enabled: asrEnabled,
          baseUrl: asrBaseUrl.replace(/\/+$/, ""),
          model: asrModel,
          language: asrLanguage,
          apiKeyEnc: currentAsr.apiKeyEnc || "",
          apiKeyLast4: currentAsr.apiKeyLast4 || "",
        };
        if (asrClearApiKey) {
          nextAsr.apiKeyEnc = "";
          nextAsr.apiKeyLast4 = "";
        } else if (asrApiKey) {
          nextAsr.apiKeyEnc = encryptSecret(asrApiKey);
          nextAsr.apiKeyLast4 = asrApiKey.slice(-4);
        }
        user.settings.asr = nextAsr;
      }
      req.user.settings = user.settings;
    });
    res.json({ ...settingsView(req.user), message: "设置已保存。" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/settings/test", requireAuth, aiLimiter, async (req, res, next) => {
  try {
    const result = await testConnection(req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/update", requireAuth, async (req, res, next) => {
  try {
    const force = req.query.refresh === "1";
    const result = await checkForUpdates(force);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// -------------------------------------------------------------------- courses

app.get("/api/courses", requireAuth, (req, res) => {
  const courses = getUserCourses(req.user.id)
    .map(courseSummary)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json({ courses });
});

app.post("/api/courses", requireAuth, async (req, res, next) => {
  try {
    const name = text(req.body?.name, { min: 1, max: 60 });
    const teacher = text(req.body?.teacher, { min: 1, max: 40 });
    if (!name || !teacher) return fail(res, 400, "请填写课程名称和老师名字。");

    const existing = getUserCourses(req.user.id).find(
      (course) =>
        course.name.toLowerCase() === name.toLowerCase() &&
        course.teacher.toLowerCase() === teacher.toLowerCase(),
    );
    if (existing) {
      return res.json({ course: courseSummary(existing), created: false });
    }

    const now = new Date().toISOString();
    const course = {
      id: crypto.randomUUID(),
      userId: req.user.id,
      name,
      teacher,
      color: COURSE_COLORS[getUserCourses(req.user.id).length % COURSE_COLORS.length],
      createdAt: now,
      updatedAt: now,
    };
    await store.update((db) => db.courses.push(course));
    res.status(201).json({ course: courseSummary(course), created: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/courses/:id", requireAuth, (req, res) => {
  const course = getCourse(req.user.id, req.params.id);
  if (!course) return fail(res, 404, "课程不存在。");
  const lectures = store.db.lectures
    .filter((lecture) => lecture.courseId === course.id && lecture.userId === req.user.id)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .map(lectureSummary);
  res.json({
    course: courseSummary(course),
    lectures,
    teacherProfile: course.teacherProfile || null,
  });
});

app.post("/api/courses/:id/teacher-profile", requireAuth, aiLimiter, async (req, res, next) => {
  if (teacherProfileInFlight.has(req.params.id)) {
    return fail(res, 409, "正在生成这位老师的画像，请稍候。");
  }
  teacherProfileInFlight.add(req.params.id);
  try {
    const course = getCourse(req.user.id, req.params.id);
    if (!course) return fail(res, 404, "课程不存在。");
    const courseLectures = store.db.lectures
      .filter(
        (lecture) =>
          lecture.courseId === course.id &&
          lecture.userId === req.user.id &&
          (lecture.segments || []).some((segment) => segment.text?.trim()),
      )
      .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
    if (!courseLectures.length) {
      return fail(res, 400, "至少需要一堂有转写内容的课，才能生成老师画像。");
    }
    const transcript = courseLectures
      .map((lecture) => `【${lecture.title}】\n${lecture.segments.map((item) => item.text).join("")}`)
      .join("\n\n");
    if (transcript.length < 60) {
      return fail(res, 400, "课堂转写还太少，再积累一些内容后再生成画像。");
    }

    const result = await analyzeTeacherProfileWithModel(
      req.user,
      course,
      courseLectures,
      transcript,
    );
    const savedProfile = {
      ...result.profile,
      teacher: course.teacher,
      lectureCount: courseLectures.length,
      segmentCount: courseLectures.reduce(
        (sum, lecture) => sum + (lecture.segments?.length || 0),
        0,
      ),
      transcriptChars: transcript.length,
      durationSeconds:
        courseLectures.reduce((sum, lecture) => sum + (lecture.durationSec || 0), 0) ||
        result.profile.durationSeconds,
    };

    await store.update((db) => {
      const target = db.courses.find((item) => item.id === course.id);
      if (!target) return;
      target.teacherProfile = savedProfile;
      target.teacherProfileUpdatedAt = savedProfile.updatedAt;
    });

    res.json({ profile: savedProfile, source: savedProfile.source, warning: result.warning });
  } catch (error) {
    next(error);
  } finally {
    teacherProfileInFlight.delete(req.params.id);
  }
});

app.patch("/api/courses/:id", requireAuth, async (req, res, next) => {
  try {
    const course = getCourse(req.user.id, req.params.id);
    if (!course) return fail(res, 404, "课程不存在。");
    const name = text(req.body?.name, { min: 1, max: 60 });
    const teacher = text(req.body?.teacher, { min: 1, max: 40 });
    if (!name && !teacher) return fail(res, 400, "没有需要更新的内容。");
    await store.update((db) => {
      const target = db.courses.find((item) => item.id === course.id);
      if (!target) return;
      if (name) target.name = name;
      if (teacher && teacher !== target.teacher) {
        target.teacher = teacher;
        // A different teacher invalidates the observable speaking-style profile.
        target.teacherProfile = null;
      }
      target.updatedAt = new Date().toISOString();
    });
    res.json({ course: courseSummary({ ...course, ...(name ? { name } : {}), ...(teacher ? { teacher } : {}) }) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/courses/:id", requireAuth, async (req, res, next) => {
  try {
    const course = getCourse(req.user.id, req.params.id);
    if (!course) return fail(res, 404, "课程不存在。");
    const lectures = store.db.lectures.filter((lecture) => lecture.courseId === course.id);
    for (const lecture of lectures) {
      if (lecture.audio?.file) {
        await fsp.unlink(path.join(AUDIO_DIR, path.basename(lecture.audio.file))).catch(() => {});
      }
      await removeImagesForLecture(lecture);
    }
    await store.update((db) => {
      db.courses = db.courses.filter((item) => item.id !== course.id);
      db.lectures = db.lectures.filter((item) => item.courseId !== course.id);
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------------- lectures

app.get("/api/dashboard", requireAuth, (req, res) => {
  const courses = getUserCourses(req.user.id)
    .map(courseSummary)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const allLectures = store.db.lectures.filter((lecture) => lecture.userId === req.user.id);
  const totalSeconds = allLectures.reduce((sum, lecture) => sum + (lecture.durationSec || 0), 0);
  const recentLectures = [...allLectures]
    .filter((lecture) => lecture.status === "completed")
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .slice(0, 3)
    .map(lectureSummary);
  const active = [...allLectures]
    .filter(
      (lecture) =>
        lecture.status === "recording" &&
        Date.now() - new Date(lecture.startedAt).getTime() < 24 * 60 * 60 * 1000,
    )
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0];

  res.json({
    courses,
    recentLectures,
    activeLecture: active ? lectureSummary(active) : null,
    stats: {
      courses: courses.length,
      lectures: allLectures.length,
      totalSeconds,
      totalHours: Math.round((totalSeconds / 3600) * 10) / 10,
    },
  });
});

app.post("/api/lectures", requireAuth, async (req, res, next) => {
  try {
    let course = req.body?.courseId ? getCourse(req.user.id, req.body.courseId) : null;
    if (req.body?.courseId && !course) return fail(res, 404, "课程不存在。");

    if (!course) {
      const name = text(req.body?.courseName, { min: 1, max: 60 });
      const teacher = text(req.body?.teacher, { min: 1, max: 40 });
      if (!name || !teacher) return fail(res, 400, "请填写课程名称和老师名字。");
      course = getUserCourses(req.user.id).find(
        (item) =>
          item.name.toLowerCase() === name.toLowerCase() &&
          item.teacher.toLowerCase() === teacher.toLowerCase(),
      );
      if (!course) {
        const now = new Date().toISOString();
        course = {
          id: crypto.randomUUID(),
          userId: req.user.id,
          name,
          teacher,
          color: COURSE_COLORS[getUserCourses(req.user.id).length % COURSE_COLORS.length],
          createdAt: now,
          updatedAt: now,
        };
        const createdCourse = course;
        await store.update((db) => db.courses.push(createdCourse));
      }
    }

    const now = new Date();
    const dateLabel = new Intl.DateTimeFormat("zh-CN", {
      month: "long",
      day: "numeric",
    }).format(now);
    const requestedTitle = text(req.body?.title, { max: 80 });
    const lecture = {
      id: crypto.randomUUID(),
      userId: req.user.id,
      courseId: course.id,
      title: requestedTitle || `${course.name} · ${dateLabel}课堂`,
      status: "recording",
      startedAt: now.toISOString(),
      endedAt: null,
      durationSec: 0,
      createdAt: now.toISOString(),
      language: text(req.body?.language, { max: 20 }) || "zh-CN",
      segments: [],
      note: null,
      chat: [],
      audio: null,
    };

    await store.update((db) => {
      db.lectures.push(lecture);
      const targetCourse = db.courses.find((item) => item.id === course.id);
      if (targetCourse) targetCourse.updatedAt = now.toISOString();
    });

    res.status(201).json({ lecture: lectureDetail(lecture) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/lectures/:id", requireAuth, (req, res) => {
  const lecture = getLecture(req.user.id, req.params.id);
  if (!lecture) return fail(res, 404, "课堂记录不存在。");
  res.json({ lecture: lectureDetail(lecture) });
});

app.patch("/api/lectures/:id", requireAuth, async (req, res, next) => {
  try {
    const lecture = getLecture(req.user.id, req.params.id);
    if (!lecture) return fail(res, 404, "课堂记录不存在。");

    const title = text(req.body?.title, { max: 80 });
    const status = req.body?.status === "completed" ? "completed" : undefined;
    const durationSec = asLimit(req.body?.durationSec, 0, 24 * 60 * 60, lecture.durationSec || 0);
    const now = new Date().toISOString();

    await store.update((db) => {
      const target = db.lectures.find((item) => item.id === lecture.id);
      if (!target) return;
      if (title) target.title = title;
      if (req.body?.durationSec !== undefined) target.durationSec = durationSec;
      if (status === "completed") {
        target.status = "completed";
        target.endedAt = target.endedAt || now;
        if (!target.durationSec) {
          target.durationSec = Math.max(
            0,
            Math.round((new Date(target.endedAt).getTime() - new Date(target.startedAt).getTime()) / 1000),
          );
        }
      }
      const course = db.courses.find((item) => item.id === target.courseId);
      if (course) course.updatedAt = now;
    });
    res.json({ lecture: lectureDetail(getLecture(req.user.id, lecture.id)) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/lectures/:id/transcript", requireAuth, async (req, res, next) => {
  try {
    const lecture = getLecture(req.user.id, req.params.id);
    if (!lecture) return fail(res, 404, "课堂记录不存在。");
    if (!Array.isArray(req.body?.segments)) return fail(res, 400, "转写数据格式不正确。");
    if (req.body.segments.length > 1200) return fail(res, 400, "转写片段过多。");

    const incoming = [];
    let totalChars = 0;
    for (const raw of req.body.segments) {
      const id = text(raw?.id, { min: 1, max: 80 });
      const content = text(raw?.text, { min: 1, max: 3000 });
      const at = asLimit(raw?.at, 0, 24 * 60 * 60, 0);
      if (!id || !content) continue;
      totalChars += content.length;
      if (totalChars > MAX_TRANSCRIPT_CHARS) return fail(res, 400, "转写内容超出长度限制。");
      incoming.push({ id, text: content, at });
    }

    await store.update((db) => {
      const target = db.lectures.find((item) => item.id === lecture.id);
      if (!target) return;
      const existing = new Map((target.segments || []).map((item) => [item.id, item]));
      for (const item of incoming) {
        existing.set(item.id, item);
      }
      target.segments = [...existing.values()].sort((a, b) => a.at - b.at);
      if (target.sectionsCount) delete target.sectionsCount;
    });

    const updated = getLecture(req.user.id, lecture.id);
    res.json({
      count: updated.segments.length,
      chars: updated.segments.reduce((n, s) => n + s.text.length, 0),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/lectures/:id/notes", requireAuth, aiLimiter, async (req, res, next) => {
  if (noteInFlight.has(req.params.id)) {
    return fail(res, 409, "正在分析这段课堂内容，请稍候。");
  }
  noteInFlight.add(req.params.id);
  try {
    const lecture = getLecture(req.user.id, req.params.id);
    if (!lecture) return fail(res, 404, "课堂记录不存在。");
    const supplied = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const fullText = (
      supplied || (lecture.segments || []).map((item) => item.text).join("")
    ).trim();
    const imageSignature = (lecture.images || []).map((image) => image.id).join(",");
    const imageChanged =
      imageSignature !== (lecture.summaryImageSignature || "") &&
      Boolean(imageSignature);
    const forceImages = req.body?.forceImages === true;
    const force = req.body?.force === true;

    if (fullText.length < 20 && !imageSignature) {
      return fail(res, 400, "课堂内容还太少，再说几句就能生成纪要。");
    }

    const cursor = force
      ? 0
      : lecture.note
        ? Math.max(
            0,
            Math.min(Number(lecture.summaryCursor) || 0, fullText.length),
          )
        : 0;
    const newText = fullText.slice(cursor);
    if (!force && newText.trim().length < 10 && !imageChanged && !forceImages) {
      if (lecture.note) {
        return res.json({
          note: noteView(lecture.note),
          source: lecture.note.source,
          skipped: true,
          lecture: lectureDetail(lecture),
        });
      }
    }

    // Only the new slice is sent to the model. The previous summary and section
    // titles carry the rest of the lecture forward at a fraction of the cost.
    const sendImages = (imageChanged || forceImages) && Boolean(imageSignature);
    const images = sendImages
      ? await loadImagesForModel(lecture, MAX_MODEL_IMAGES)
      : [];
    const previousSections = force ? [] : ensureNoteSections(lecture.note);
    const result = await analyzeWithModel(req.user, {
      newText,
      fullText,
      previous:
        !force && lecture.note
          ? {
              summary: lecture.note.summary,
              keyPoints: lecture.note.keyPoints,
              sections: previousSections
                .slice(-6)
                .map((section) => ({
                  index: section.index,
                  title: section.title,
                })),
            }
          : null,
      images,
    });
    const { section: candidateSection, ...noteBody } = result.note;
    const sections = appendSection(
      lecture,
      previousSections,
      candidateSection,
      cursor,
      newText,
    );
    const signature = summarySignature(noteBody.summary, noteBody.keyPoints);
    const carriedDiagram =
      !force &&
      lecture.note?.diagram &&
      lecture.note.diagram.basedOn === signature
        ? lecture.note.diagram
        : null;
    await store.update((db) => {
      const target = db.lectures.find((item) => item.id === lecture.id);
      if (!target) return;
      target.note = { ...noteBody, sections, diagram: carriedDiagram };
      target.noteUpdatedAt = noteBody.updatedAt;
      target.summaryCursor = fullText.length;
      target.summaryImageSignature = imageSignature;
    });
    const updated = getLecture(req.user.id, lecture.id);
    res.json({
      ...result,
      note: noteView(updated.note),
      lecture: lectureDetail(updated),
    });
  } catch (error) {
    next(error);
  } finally {
    noteInFlight.delete(req.params.id);
  }
});

app.post("/api/lectures/:id/diagram", requireAuth, aiLimiter, async (req, res, next) => {
  const lecture = getLecture(req.user.id, req.params.id);
  if (!lecture) return fail(res, 404, "课堂记录不存在。");
  if (!lecture.note?.summary) {
    return fail(res, 400, "请先生成课堂摘要，再梳理逻辑示意图。");
  }

  const scope = req.body?.scope === "section" ? "section" : "overall";
  const sectionId =
    typeof req.body?.sectionId === "string" ? req.body.sectionId.trim() : "";
  const refresh = req.body?.refresh === true;
  const sections = ensureNoteSections(lecture.note);
  const section =
    scope === "section" ? sections.find((item) => item.id === sectionId) : null;
  if (scope === "section" && !section) {
    return fail(res, 404, "没有找到这段摘要。");
  }

  const title = scope === "section" ? section.title : lecture.title;
  const summary = scope === "section" ? section.summary : lecture.note.summary;
  const points =
    scope === "section" ? section.points : lecture.note.keyPoints || [];
  const keywords = scope === "section" ? [] : lecture.note.keywords || [];
  if (!summary) return fail(res, 400, "这段内容还没有可梳理的摘要。");

  const signature = summarySignature(summary, points);
  const current =
    scope === "section" ? section.diagram : lecture.note.diagram;
  if (
    !refresh &&
    current &&
    current.basedOn === signature &&
    Array.isArray(current.branches) &&
    current.branches.length
  ) {
    return res.json({ diagram: current, source: current.source, cached: true });
  }

  const flightKey = `${lecture.id}:${scope}:${sectionId}`;
  if (diagramInFlight.has(flightKey)) {
    return fail(res, 409, "正在梳理这幅示意图，请稍候。");
  }
  diagramInFlight.add(flightKey);
  try {
    const result = await generateDiagramWithModel(req.user, {
      title,
      summary,
      points,
      keywords,
    });
    const diagram = {
      ...result.diagram,
      basedOn: signature,
      updatedAt: new Date().toISOString(),
    };
    await store.update((db) => {
      const target = db.lectures.find((item) => item.id === lecture.id);
      if (!target?.note) return;
      target.note.sections = ensureNoteSections(target.note);
      if (scope === "section") {
        const targetSection = target.note.sections.find(
          (item) => item.id === sectionId,
        );
        if (targetSection) targetSection.diagram = diagram;
      } else {
        target.note.diagram = diagram;
      }
    });
    res.json({
      diagram,
      source: result.source,
      warning: result.warning,
      cached: false,
    });
  } catch (error) {
    next(error);
  } finally {
    diagramInFlight.delete(flightKey);
  }
});

function sseSend(res, event, data) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.post("/api/lectures/:id/chat", requireAuth, aiLimiter, async (req, res, next) => {
  let headersSent = false;
  try {
    const lecture = getLecture(req.user.id, req.params.id);
    if (!lecture) return fail(res, 404, "课堂记录不存在。");
    const question = text(req.body?.content, { min: 1, max: 1200 });
    if (!question) return fail(res, 400, "请输入问题。");
    const supplied =
      typeof req.body?.text === "string" ? req.body.text.trim().slice(-MAX_TRANSCRIPT_CHARS) : "";
    const transcript = supplied || (lecture.segments || []).map((item) => item.text).join("");

    let history = [];
    let userMessage;
    await store.update((db) => {
      const target = db.lectures.find((item) => item.id === lecture.id);
      if (!target) return;
      history = (target.chat || []).slice(-10);
      userMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: question,
        createdAt: new Date().toISOString(),
      };
      target.chat = target.chat || [];
      target.chat.push(userMessage);
    });

    const config = readLlmConfig(req.user);
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    headersSent = true;

    sseSend(res, "start", {
      userMessageId: userMessage.id,
      source: config.configured ? "ai" : "local",
    });

    let full = "";
    let source = config.configured ? "ai" : "local";
    let warning = "";

    const lectureCourse = store.db.courses.find((item) => item.id === lecture.courseId);
    const lectureForPrompt = {
      ...lecture,
      courseName: lectureCourse?.name || "",
      teacher: lectureCourse?.teacher || "",
    };
    const images = await loadImagesForModel(lecture, MAX_MODEL_IMAGES);

    if (config.configured) {
      const stream = async (withImages) =>
        streamChatCompletion(
          req.user,
          buildChatMessages(
            lectureForPrompt,
            transcript,
            history,
            question,
            withImages ? images : [],
          ),
          (delta) => {
            full += delta;
            sseSend(res, "delta", { text: delta });
          },
          controller.signal,
        );

      try {
        full = await stream(images.length > 0);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "模型服务异常";
        console.warn(`[chat] AI 服务失败：${reason.slice(0, 180)}`);
        if (!full.trim() && images.length) {
          warning = "当前模型不支持图片分析，本轮回答将只基于文字。";
          sseSend(res, "source", { source: "ai", warning });
          try {
            full = await stream(false);
          } catch (retryError) {
            const retryReason =
              retryError instanceof Error ? retryError.message : "模型服务异常";
            console.warn(`[chat] 文字模式也失败：${retryReason.slice(0, 180)}`);
          }
        }
        if (!full.trim()) {
          source = "local";
          warning = images.length
            ? "AI 服务暂时不可用或不支持图片，以下回答由本地课堂检索生成。"
            : "AI 服务暂时不可用，以下回答由本地课堂检索生成。";
          sseSend(res, "source", { source: "local", warning });
          full = answerLocally(question, transcript, lecture.note);
          const chunks = full.match(/[\s\S]{1,22}/g) || [full];
          for (const chunk of chunks) {
            sseSend(res, "delta", { text: chunk });
            await delay(16);
          }
        } else if (!warning) {
          warning = "回答生成中断，以上内容可能不完整。";
        }
      }
    } else {
      full = answerLocally(question, transcript, lecture.note);
      const chunks = full.match(/[\s\S]{1,22}/g) || [full];
      for (const chunk of chunks) {
        sseSend(res, "delta", { text: chunk });
        await delay(16);
      }
    }

    const assistantMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: full.trim(),
      createdAt: new Date().toISOString(),
      source,
    };
    await store.update((db) => {
      const target = db.lectures.find((item) => item.id === lecture.id);
      if (!target) return;
      target.chat = target.chat || [];
      target.chat.push(assistantMessage);
    });

    sseSend(res, "done", {
      messageId: assistantMessage.id,
      source,
      warning,
      content: assistantMessage.content,
    });
    res.end();
  } catch (error) {
    if (!headersSent) return next(error);
    sseSend(res, "error", { message: "回答过程中出现问题，请重试。" });
    res.end();
  }
});

app.delete("/api/lectures/:id", requireAuth, async (req, res, next) => {
  try {
    const lecture = getLecture(req.user.id, req.params.id);
    if (!lecture) return fail(res, 404, "课堂记录不存在。");
    if (lecture.audio?.file) {
      await fsp.unlink(path.join(AUDIO_DIR, path.basename(lecture.audio.file))).catch(() => {});
    }
    await removeImagesForLecture(lecture);
    await store.update((db) => {
      db.lectures = db.lectures.filter((item) => item.id !== lecture.id);
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------------------------- images

const IMAGE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

app.post(
  "/api/lectures/:id/images",
  requireAuth,
  express.raw({ type: () => true, limit: "12mb" }),
  async (req, res, next) => {
    try {
      const lecture = getLecture(req.user.id, req.params.id);
      if (!lecture) return fail(res, 404, "课堂记录不存在。");
      if (!Buffer.isBuffer(req.body) || req.body.length < 1000) {
        return fail(res, 400, "没有收到有效的图片数据。");
      }
      const rawType = String(req.headers["content-type"] || "").split(";")[0].trim();
      const mime = IMAGE_EXTENSIONS[rawType] ? rawType : "";
      if (!mime) return fail(res, 400, "只支持 JPG、PNG 或 WebP 图片。");
      if ((lecture.images?.length || 0) >= MAX_LECTURE_IMAGES) {
        return fail(res, 400, `每堂课最多添加 ${MAX_LECTURE_IMAGES} 张图片。`);
      }

      const id = crypto.randomUUID();
      const extension = IMAGE_EXTENSIONS[mime];
      const filename = `${id}.${extension}`;
      const directory = ensureImageDir(lecture.id);
      await fsp.writeFile(path.join(directory, filename), req.body);
      const image = {
        id,
        file: filename,
        mime,
        size: req.body.length,
        createdAt: new Date().toISOString(),
      };
      await store.update((db) => {
        const target = db.lectures.find((item) => item.id === lecture.id);
        if (!target) return;
        target.images = [...(target.images || []), image];
      });
      res.status(201).json({ image: publicImage(lecture.id, image) });
    } catch (error) {
      next(error);
    }
  },
);

app.get("/api/lectures/:id/images/:imageId", requireAuth, (req, res, next) => {
  const lecture = getLecture(req.user.id, req.params.id);
  const image = lecture?.images?.find((item) => item.id === req.params.imageId);
  if (!lecture || !image) return fail(res, 404, "图片不存在。");
  const file = path.join(IMAGES_DIR, path.basename(lecture.id), path.basename(image.file));
  if (!fs.existsSync(file)) return fail(res, 404, "图片文件已丢失。");
  res.type(image.mime || "image/jpeg");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.sendFile(file, (error) => {
    if (error && !res.headersSent) next(error);
  });
});

app.delete("/api/lectures/:id/images/:imageId", requireAuth, async (req, res, next) => {
  try {
    const lecture = getLecture(req.user.id, req.params.id);
    const image = lecture?.images?.find((item) => item.id === req.params.imageId);
    if (!lecture || !image) return fail(res, 404, "图片不存在。");
    await fsp
      .unlink(path.join(IMAGES_DIR, path.basename(lecture.id), path.basename(image.file)))
      .catch(() => {});
    await store.update((db) => {
      const target = db.lectures.find((item) => item.id === lecture.id);
      if (!target) return;
      target.images = (target.images || []).filter((item) => item.id !== image.id);
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------------------ asr

app.post(
  "/api/lectures/:id/asr",
  requireAuth,
  aiLimiter,
  express.raw({ type: () => true, limit: "10mb" }),
  async (req, res, next) => {
    try {
      const lecture = getLecture(req.user.id, req.params.id);
      if (!lecture) return fail(res, 404, "课堂记录不存在。");
      const config = readAsrConfig(req.user);
      if (!config.configured) {
        return fail(res, 400, "尚未配置服务端语音识别。");
      }
      if (!Buffer.isBuffer(req.body) || req.body.length < 500) {
        return fail(res, 400, "没有收到有效的音频分片。");
      }
      const mime = String(req.headers["content-type"] || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      if (!mime.startsWith("audio/")) {
        return fail(res, 400, "音频分片格式不正确。");
      }
      const text = await transcribeAudio(req.user, req.body, mime);
      if (!text) return fail(res, 422, "这段音频没有识别到文字。");
      res.json({ text });
    } catch (error) {
      const message = error instanceof Error ? error.message : "语音识别失败。";
      console.warn(`[asr] ${message.slice(0, 200)}`);
      return fail(res, 502, `语音识别暂时不可用：${message.slice(0, 120)}`);
    }
  },
);

// ---------------------------------------------------------------------- audio

const AUDIO_EXTENSIONS = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

app.post(
  "/api/lectures/:id/audio",
  requireAuth,
  express.raw({ type: () => true, limit: MAX_AUDIO_BYTES }),
  async (req, res, next) => {
    try {
      const lecture = getLecture(req.user.id, req.params.id);
      if (!lecture) return fail(res, 404, "课堂记录不存在。");
      if (!Buffer.isBuffer(req.body) || req.body.length < 512) {
        return fail(res, 400, "没有收到有效的录音数据。");
      }
      const rawType = String(req.headers["content-type"] || "").split(";")[0].trim();
      const mime = AUDIO_EXTENSIONS[rawType] ? rawType : "audio/webm";
      const extension = AUDIO_EXTENSIONS[mime];
      const filename = `${lecture.id}-${Date.now()}.${extension}`;
      const destination = path.join(AUDIO_DIR, filename);
      await fsp.writeFile(destination, req.body);

      if (lecture.audio?.file) {
        const oldFile = path.join(AUDIO_DIR, path.basename(lecture.audio.file));
        await fsp.unlink(oldFile).catch(() => {});
      }
      await store.update((db) => {
        const target = db.lectures.find((item) => item.id === lecture.id);
        if (!target) return;
        target.audio = {
          file: filename,
          mime,
          size: req.body.length,
          uploadedAt: new Date().toISOString(),
        };
      });
      res.json({ ok: true, size: req.body.length, mime });
    } catch (error) {
      next(error);
    }
  },
);

app.get("/api/lectures/:id/audio", requireAuth, (req, res, next) => {
  const lecture = getLecture(req.user.id, req.params.id);
  if (!lecture?.audio?.file) return fail(res, 404, "这条课堂记录没有音频。");
  const filename = path.basename(lecture.audio.file);
  const filePath = path.join(AUDIO_DIR, filename);
  if (!fs.existsSync(filePath)) return fail(res, 404, "音频文件已丢失。");
  res.setHeader("Content-Type", lecture.audio.mime || "audio/webm");
  res.setHeader("Content-Disposition", "inline");
  res.sendFile(filePath, (error) => {
    if (error && !res.headersSent) next(error);
  });
});

// --------------------------------------------------------------------- serving

app.use("/api", (req, res) => fail(res, 404, "接口不存在。"));

if (IS_DEV) {
  // Keep this specifier dynamic so desktop packaging does not try to bundle
  // the development-only Vite dependency into the production executable.
  const vitePackage = "vite";
  const { createServer } = await import(vitePackage);
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  if (!fs.existsSync(path.join(DIST_DIR, "index.html"))) {
    console.error(`找不到 ${path.join(DIST_DIR, "index.html")}，请先运行 pnpm build。`);
    process.exit(1);
  }
  app.use(express.static(DIST_DIR, { index: false, maxAge: "1h" }));
  app.get("*", (req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

app.use((error, req, res, next) => {
  console.error("[server]", error);
  if (res.headersSent) return next(error);
  if (error?.type === "entity.too.large") {
    return fail(res, 413, "上传内容过大。");
  }
  if (error instanceof SyntaxError && "body" in error) {
    return fail(res, 400, "请求内容不是有效的 JSON。");
  }
  return fail(res, 500, "服务器开小差了，请稍后再试。");
});

const server = app.listen(PORT, HOST, () => {
  console.log(`\n  聆记 LingJi 已启动`);
  console.log(`  http://${HOST}:${PORT}`);
  console.log(`  模式：${IS_DEV ? "开发（Vite HMR）" : "生产"}\n`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`端口 ${PORT} 已被占用。请设置 PORT 环境变量后重试。`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
