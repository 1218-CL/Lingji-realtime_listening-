import { APP_VERSION, UPDATE_MANIFEST_URL } from "./config.mjs";

let cache = {
  url: "",
  at: 0,
  value: null,
};

function parseVersion(value) {
  const match = String(value || "")
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function safeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol === "https:") return url.toString();
    if (
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "::1"].includes(url.hostname)
    ) {
      return url.toString();
    }
  } catch {
    // invalid URL
  }
  return "";
}

function normalizeManifest(raw) {
  if (!raw || typeof raw !== "object") throw new Error("更新清单格式不正确");
  const version = String(raw.version || "").trim();
  if (!parseVersion(version)) throw new Error("更新清单缺少有效版本号");
  const downloadUrl = safeUrl(
    raw.downloadUrl || raw.installerUrl || raw.windows?.installerUrl,
  );
  if (!downloadUrl) throw new Error("更新清单缺少安装包地址");
  return {
    version,
    publishedAt:
      typeof raw.publishedAt === "string" ? raw.publishedAt.slice(0, 40) : null,
    notes: Array.isArray(raw.notes)
      ? raw.notes
          .filter((item) => typeof item === "string" && item.trim())
          .map((item) => item.trim().slice(0, 180))
          .slice(0, 8)
      : [],
    downloadUrl,
    sha256:
      typeof raw.sha256 === "string" && /^[a-f0-9]{64}$/i.test(raw.sha256)
        ? raw.sha256.toLowerCase()
        : "",
    size: Number.isFinite(Number(raw.size)) ? Number(raw.size) : null,
  };
}

async function fetchManifest(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "LingJi-Updater/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(6500),
  });
  if (!response.ok) throw new Error(`更新服务器返回 ${response.status}`);
  const body = await response.text();
  if (body.length > 200_000) throw new Error("更新清单过大");
  return normalizeManifest(JSON.parse(body));
}

export async function checkForUpdates(force = false) {
  const base = {
    currentVersion: APP_VERSION,
    configured: Boolean(UPDATE_MANIFEST_URL),
    updateAvailable: false,
    checkedAt: new Date().toISOString(),
  };

  if (!UPDATE_MANIFEST_URL) {
    return {
      ...base,
      error: null,
      message: "此版本尚未配置更新通道。",
    };
  }

  const configuredUrl = safeUrl(UPDATE_MANIFEST_URL);
  if (!configuredUrl) {
    return {
      ...base,
      configured: false,
      error: "更新通道地址无效。",
    };
  }

  const now = Date.now();
  if (
    !force &&
    cache.value &&
    cache.url === configuredUrl &&
    now - cache.at < 5 * 60 * 1000
  ) {
    return cache.value;
  }

  try {
    const manifest = await fetchManifest(configuredUrl);
    const value = {
      ...base,
      updateAvailable: compareVersions(manifest.version, APP_VERSION) > 0,
      latestVersion: manifest.version,
      publishedAt: manifest.publishedAt,
      notes: manifest.notes,
      downloadUrl: manifest.downloadUrl,
      sha256: manifest.sha256,
      size: manifest.size,
      error: null,
    };
    cache = { url: configuredUrl, at: now, value };
    return value;
  } catch (error) {
    const value = {
      ...base,
      error: "暂时无法检查更新，请稍后重试。",
    };
    cache = { url: configuredUrl, at: now, value };
    console.warn(`[update] 检查更新失败：${error.message}`);
    return value;
  }
}
