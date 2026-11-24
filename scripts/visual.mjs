import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4173";
const EDGE =
  process.env.EDGE_PATH ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const DEBUG_PORT = 9333;
const OUT = path.resolve("screenshots");
const PROFILE = path.resolve(".browser-profile-visual");

await fsp.mkdir(OUT, { recursive: true });
for (const file of await fsp.readdir(OUT)) {
  if (file.endsWith(".png")) await fsp.unlink(path.join(OUT, file));
}

let cookie = "";
async function api(pathname, options = {}) {
  const headers = new Headers(options.headers || {});
  if (cookie) headers.set("Cookie", cookie);
  if (options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${BASE}${pathname}`, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  if (!response.ok) throw new Error(`${pathname} -> ${response.status}: ${await response.text()}`);
  return response.json();
}

const loginResponse = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "demo", password: "demo1234" }),
});
const setCookie = loginResponse.headers.get("set-cookie");
if (!setCookie) throw new Error("登录未返回 Cookie");
cookie = setCookie.split(";")[0];
const sessionValue = cookie.split("=")[1];

const dashboard = await api("/api/dashboard");
const courseId = dashboard.courses[0].id;
const reviewLecture = dashboard.recentLectures[0];

const edge = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-crash-reporter",
    "--disable-features=Translate,MediaRouter",
    `--user-data-dir=${PROFILE}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    "--window-size=1440,1100",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true },
);

async function waitForDebugger() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (response.ok) return;
    } catch {
      // still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Edge 调试端口没有启动");
}

await waitForDebugger();

const targetResponse = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, {
  method: "PUT",
});
const target = await targetResponse.json();

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.counter = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.listeners = new Map();
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      } else if (message.method) {
        for (const listener of this.listeners.get(message.method) || []) {
          listener(message.params);
        }
      }
    };
  }

  on(method, listener) {
    const list = this.listeners.get(method) || [];
    list.push(listener);
    this.listeners.set(method, list);
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.counter;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

const cdp = new CDP(target.webSocketDebuggerUrl);
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Log.enable");
await cdp.send("Network.enable");
await cdp.send("Network.clearBrowserCookies");

const pageErrors = [];
cdp.on("Runtime.exceptionThrown", (params) => {
  pageErrors.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text);
});
cdp.on("Log.entryAdded", (params) => {
  if (params.entry?.level === "error" && !/favicon/i.test(params.entry.text || "")) {
    pageErrors.push(params.entry.text);
  }
});

async function viewport(width, height, mobile = false) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
}

async function go(url, wait = 2200) {
  await cdp.send("Page.navigate", { url });
  await new Promise((resolve) => setTimeout(resolve, wait));
  await cdp.send("Runtime.evaluate", {
    expression: "window.scrollTo(0,0); document.fonts ? document.fonts.ready : true",
    awaitPromise: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 350));
  const location = await cdp.send("Runtime.evaluate", {
    expression: "location.pathname",
    returnByValue: true,
  });
  return location.result?.value;
}

async function shot(name) {
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const file = path.join(OUT, name);
  await fsp.writeFile(file, Buffer.from(result.data, "base64"));
  console.log(`[shot] ${file}`);
}

const asrUiTest = process.env.ASR_UI_TEST === "1";
let mockAsr = null;
if (asrUiTest) {
  mockAsr = http.createServer((req, res) => {
    if (req.url?.endsWith("/audio/transcriptions") && req.method === "POST") {
      req.resume();
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ text: "这是服务端 ASR 返回的测试转写。" }));
      });
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve) => mockAsr.listen(4198, "127.0.0.1", resolve));
}

await viewport(1440, 1000);
await go(`${BASE}/login`);
await shot("01-login.png");

await cdp.send("Network.setCookie", {
  name: "lingji_session",
  value: sessionValue,
  url: `${BASE}/`,
});
await cdp.send("Network.setCookie", {
  name: "lingji_session",
  value: sessionValue,
  domain: "127.0.0.1",
  path: "/",
});

if (asrUiTest) {
  const originalSettings = await api("/api/settings");
  await api("/api/settings", {
    method: "PUT",
    body: JSON.stringify({
      provider: originalSettings.llm.provider,
      baseUrl: originalSettings.llm.baseUrl,
      model: originalSettings.llm.model,
      asr: {
        enabled: true,
        baseUrl: "http://127.0.0.1:4198/v1",
        model: "mock-asr",
        language: "zh",
        apiKey: "mock-asr-key",
      },
    }),
  });
  const created = await api("/api/lectures", {
    method: "POST",
    body: JSON.stringify({ courseId }),
  });
  const lectureId = created.lecture.id;
  await viewport(1440, 1000);
  await go(`${BASE}/record/${lectureId}`, 3200);
  await new Promise((resolve) => setTimeout(resolve, 22_000));
  const detail = await api(`/api/lectures/${lectureId}`);
  const texts = detail.lecture.segments.map((segment) => segment.text);
  console.log("[asr ui]", texts);
  if (!texts.some((text) => text.includes("服务端 ASR 返回的测试转写"))) {
    throw new Error("服务端 ASR 分片没有追加到转写");
  }
  await api(`/api/lectures/${lectureId}`, { method: "DELETE" });
  await api("/api/settings", {
    method: "PUT",
    body: JSON.stringify({
      provider: originalSettings.llm.provider,
      baseUrl: originalSettings.llm.baseUrl,
      model: originalSettings.llm.model,
      asr: {
        enabled: originalSettings.asr.enabled,
        baseUrl: originalSettings.asr.baseUrl,
        model: originalSettings.asr.model,
        language: originalSettings.asr.language,
        clearApiKey: !originalSettings.asr.hasApiKey,
      },
    }),
  });
  mockAsr?.close();
  await cdp.send("Browser.close").catch(() => {});
  cdp.close();
  edge.kill();
  console.log("✓ ASR UI 分片测试通过");
  setTimeout(() => process.exit(0), 300);
} else {

await viewport(1440, 1100);
const homePath = await go(`${BASE}/`);
console.log("[path]", homePath === "/" ? "authenticated" : `unexpected ${homePath}`);
await shot("02-home.png");

const updateNotice = await cdp.send("Runtime.evaluate", {
  expression: "Boolean(document.querySelector('.update-banner'))",
  returnByValue: true,
});
if (updateNotice.result?.value) {
  await shot("12-update-banner.png");
  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('.update-banner-open')?.click()",
  });
  await new Promise((resolve) => setTimeout(resolve, 600));
  await shot("13-update-modal.png");
  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('.update-modal .modal-close')?.click()",
  });
}

const reviewImage = await api(`/api/lectures/${reviewLecture.id}/images`, {
  method: "POST",
  headers: { "Content-Type": "image/png" },
  body: fs.readFileSync("build/icon.png"),
});

await viewport(1440, 1100);
await go(`${BASE}/lecture/${reviewLecture.id}`);
await shot("03-review.png");
await cdp.send("Runtime.evaluate", {
  expression: "document.querySelector('.review-summary .diagram-trigger')?.click()",
});
await new Promise((resolve) => setTimeout(resolve, 1600));
await shot("15-logic-diagram.png");
const diagramState = await cdp.send("Runtime.evaluate", {
  expression:
    "({boxes: document.querySelectorAll('.logic-diagram-svg .diagram-box').length, branches: document.querySelectorAll('.logic-diagram-svg .diagram-branch').length, loading: Boolean(document.querySelector('.diagram-loading'))})",
  returnByValue: true,
});
console.log("[diagram]", JSON.stringify(diagramState.result?.value));
if (!diagramState.result?.value?.branches) {
  throw new Error("逻辑示意图没有渲染出分支");
}
await cdp.send("Runtime.evaluate", {
  expression: "document.querySelector('.diagram-actions .button')?.click()",
});
await new Promise((resolve) => setTimeout(resolve, 1400));
await shot("16-logic-diagram-refreshed.png");
await cdp.send("Runtime.evaluate", {
  expression: "document.querySelector('.diagram-modal .modal-close')?.click()",
});
await new Promise((resolve) => setTimeout(resolve, 350));
await api(`/api/lectures/${reviewLecture.id}/images/${reviewImage.image.id}`, {
  method: "DELETE",
});

await go(`${BASE}/space`);
await shot("04-space.png");

await go(`${BASE}/space/${courseId}`);
await shot("05-course.png");

await go(`${BASE}/settings`);
await shot("06-settings.png");

await viewport(390, 844, true);
await go(`${BASE}/space/${courseId}`);
await cdp.send("Runtime.evaluate", {
  expression:
    "document.getElementById('teacher-profile')?.scrollIntoView({block:'start'});",
});
await new Promise((resolve) => setTimeout(resolve, 700));
await shot("07-mobile-course.png");

const created = await api("/api/lectures", {
  method: "POST",
  body: JSON.stringify({ courseId }),
});
const liveLecture = created.lecture;
const transcript =
  "今天我们来聊注意力是如何被平台重新组织的。传统媒体争夺的是曝光时段，而推荐系统争夺的是你下一次停留。每一次停留、点赞、划走，都会成为下一次推荐的材料。注意力不再只是一个心理状态，它被拆成了可以计算的行为指标。这里有一个关键悖论：用户以为自己在自由选择，但选项本身已经被个性化排序。我们需要区分选择的自由，和被设计的选择集。算法并不需要理解内容的意义，它只需要预测哪种内容能延长停留。所以情绪强烈、立场鲜明的内容往往更容易获得传播优势。";
await api(`/api/lectures/${liveLecture.id}/transcript`, {
  method: "PUT",
  body: JSON.stringify({
    segments: [
      {
        id: "visual-1",
        text: "今天我们来聊注意力是如何被平台重新组织的。传统媒体争夺的是曝光时段，而推荐系统争夺的是你下一次停留。",
        at: 12,
      },
      {
        id: "visual-2",
        text: "每一次停留、点赞、划走，都会成为下一次推荐的材料。注意力不再只是一个心理状态，它被拆成了可以计算的行为指标。",
        at: 46,
      },
      {
        id: "visual-3",
        text: "这里有一个关键悖论：用户以为自己在自由选择，但选项本身已经被个性化排序。我们需要区分选择的自由，和被设计的选择集。",
        at: 94,
      },
      {
        id: "visual-4",
        text: "算法并不需要理解内容的意义，它只需要预测哪种内容能延长停留。所以情绪强烈、立场鲜明的内容往往更容易获得传播优势。",
        at: 138,
      },
    ],
  }),
});
await api(`/api/lectures/${liveLecture.id}/notes`, {
  method: "POST",
  body: JSON.stringify({ text: transcript }),
});
await api(`/api/lectures/${liveLecture.id}/transcript`, {
  method: "PUT",
  body: JSON.stringify({
    segments: [
      {
        id: "visual-1",
        text: "今天我们来聊注意力是如何被平台重新组织的。传统媒体争夺的是曝光时段，而推荐系统争夺的是你下一次停留。",
        at: 12,
      },
      {
        id: "visual-2",
        text: "每一次停留、点赞、划走，都会成为下一次推荐的材料。注意力不再只是一个心理状态，它被拆成了可以计算的行为指标。",
        at: 46,
      },
      {
        id: "visual-3",
        text: "这里有一个关键悖论：用户以为自己在自由选择，但选项本身已经被个性化排序。我们需要区分选择的自由，和被设计的选择集。",
        at: 94,
      },
      {
        id: "visual-4",
        text: "算法并不需要理解内容的意义，它只需要预测哪种内容能延长停留。所以情绪强烈、立场鲜明的内容往往更容易获得传播优势。",
        at: 138,
      },
      {
        id: "visual-5",
        text: "补充一段：平台还会根据用户停留的微小差异，不断调整下一条内容，这个过程几乎没有明确的起点和终点。",
        at: 170,
      },
    ],
  }),
});
await api(`/api/lectures/${liveLecture.id}/images`, {
  method: "POST",
  headers: { "Content-Type": "image/png" },
  body: fs.readFileSync("build/icon.png"),
});

await viewport(1440, 1000);
await go(`${BASE}/record/${liveLecture.id}`, 4200);
await shot("08-recording.png");
const noteDebug = await cdp.send("Runtime.evaluate", {
  expression: `fetch('/api/lectures/${liveLecture.id}').then(r=>r.json()).then(x=>({state:x.lecture.summaryState,button:document.querySelector('.note-update-button')?.innerText}))`,
  awaitPromise: true,
  returnByValue: true,
});
console.log("[note state]", JSON.stringify(noteDebug.result?.value));

await cdp.send("Runtime.evaluate", {
  expression: "document.querySelector('.transcript-peek')?.click()",
});
await new Promise((resolve) => setTimeout(resolve, 700));
await shot("14-transcript-drawer.png");
await cdp.send("Runtime.evaluate", {
  expression: "document.querySelector('.transcript-drawer-close')?.click()",
});
await new Promise((resolve) => setTimeout(resolve, 350));

await cdp.send("Runtime.evaluate", {
  expression: "document.querySelector('.note-update-button')?.click()",
});
await new Promise((resolve) => setTimeout(resolve, 2200));
const pendingAfterClick = await cdp.send("Runtime.evaluate", {
  expression: "document.querySelectorAll('.note-pending-pill').length",
  returnByValue: true,
});
console.log(`[manual summary] pending pills after click: ${pendingAfterClick.result?.value}`);
if (pendingAfterClick.result?.value > 0) {
  throw new Error("手动更新摘要后仍有 pending 标记");
}

const readTimer = async () => {
  const result = await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('.record-timer')?.textContent || ''",
    returnByValue: true,
  });
  const parts = String(result.result?.value || "00:00:00")
    .split(":")
    .map((value) => Number(value));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
};
const timerBeforeReload = await readTimer();
await new Promise((resolve) => setTimeout(resolve, 1500));
await cdp.send("Page.reload");
await new Promise((resolve) => setTimeout(resolve, 3800));
const timerAfterReload = await readTimer();
console.log(`[timer] ${timerBeforeReload}s -> ${timerAfterReload}s after reload`);
if (timerAfterReload < timerBeforeReload) {
  throw new Error("刷新后课堂计时被清零");
}

await viewport(390, 844, true);
await go(`${BASE}/record/${liveLecture.id}`, 3600);
await shot("09-mobile-recording.png");

await api(`/api/lectures/${liveLecture.id}`, { method: "DELETE" }).catch(() => {});

await viewport(390, 844, true);
await go(`${BASE}/`);
await shot("10-mobile-home.png");

await cdp.send("Network.clearBrowserCookies");
await viewport(390, 844, true);
await go(`${BASE}/login`);
await shot("11-mobile-login.png");

if (pageErrors.length) {
  console.log("[page errors]", pageErrors.slice(0, 12));
} else {
  console.log("✓ 页面无 JavaScript 异常");
}
console.log("✓ 截图完成，临时课堂已清理");

await cdp.send("Browser.close").catch(() => {});
cdp.close();
edge.kill();
setTimeout(() => process.exit(0), 300);
}
