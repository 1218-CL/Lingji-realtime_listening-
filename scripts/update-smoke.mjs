import assert from "node:assert/strict";
import http from "node:http";

const manifest = {
  version: "1.2.0",
  publishedAt: "2026-12-01T08:00:00.000Z",
  notes: ["支持图片辅助分析", "纪要保持每分钟更新"],
  downloadUrl: "https://example.com/LingJi-Setup-1.2.0.exe",
  sha256: "a".repeat(64),
  size: 22_000_000,
};

const server = http.createServer((req, res) => {
  if (req.url !== "/latest.json") {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(manifest));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
process.env.APP_VERSION = "1.1.0";
process.env.UPDATE_MANIFEST_URL = `http://127.0.0.1:${port}/latest.json`;

const { checkForUpdates, compareVersions } = await import("../server/updates.mjs");

assert.equal(compareVersions("1.2.0", "1.1.9"), 1);
assert.equal(compareVersions("1.1.0", "1.1.0"), 0);
assert.equal(compareVersions("1.0.9", "1.1.0"), -1);

const result = await checkForUpdates(true);
assert.equal(result.configured, true);
assert.equal(result.currentVersion, "1.1.0");
assert.equal(result.latestVersion, "1.2.0");
assert.equal(result.updateAvailable, true);
assert.equal(result.notes.length, 2);
assert.ok(result.downloadUrl.startsWith("https://"));

server.close();
console.log("update smoke ok");
