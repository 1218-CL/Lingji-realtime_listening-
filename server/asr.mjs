import { decryptSecret } from "./auth.mjs";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function transcriptionUrl(baseUrl) {
  const clean = normalizeBaseUrl(baseUrl);
  if (/\/audio\/transcriptions$/i.test(clean)) return clean;
  return `${clean}/audio/transcriptions`;
}

export function readAsrConfig(user) {
  const asr = user?.settings?.asr || {};
  const baseUrl = normalizeBaseUrl(asr.baseUrl);
  const model = String(asr.model || "").trim();
  return {
    enabled: Boolean(asr.enabled),
    baseUrl,
    model,
    language: String(asr.language || "zh").trim() || "zh",
    apiKey: decryptSecret(asr.apiKeyEnc),
    hasApiKey: Boolean(asr.apiKeyEnc),
    apiKeyLast4: asr.apiKeyLast4 || "",
    configured: Boolean(asr.enabled && baseUrl && model),
  };
}

function audioExtension(mime) {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

async function readError(response) {
  try {
    const text = (await response.text()).replace(/\s+/g, " ").trim();
    return text.slice(0, 240) || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export async function transcribeAudio(user, buffer, mime) {
  const config = readAsrConfig(user);
  if (!config.configured) throw new Error("尚未配置服务端语音识别。");

  const form = new FormData();
  form.append(
    "file",
    new Blob([buffer], { type: mime }),
    `chunk.${audioExtension(mime)}`,
  );
  form.append("model", config.model);
  form.append("language", config.language);
  form.append("response_format", "json");

  const headers = {};
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const response = await fetch(transcriptionUrl(config.baseUrl), {
    method: "POST",
    headers,
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(await readError(response));

  const raw = await response.text();
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    // Some compatible providers return plain text instead of JSON.
  }
  const text =
    typeof data?.text === "string"
      ? data.text
      : typeof data?.transcription === "string"
        ? data.transcription
        : String(raw || "").slice(0, 20_000);
  return text.trim().slice(0, 20_000);
}
