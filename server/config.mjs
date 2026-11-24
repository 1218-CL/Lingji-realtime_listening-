import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, ".data");
export const AUDIO_DIR = path.join(DATA_DIR, "audio");
export const IMAGES_DIR = path.join(DATA_DIR, "images");
export const DB_FILE = path.join(DATA_DIR, "db.json");
export const SECRET_FILE = path.join(DATA_DIR, "secret");
export const DIST_DIR = process.env.LINGJI_DIST_DIR
  ? path.resolve(process.env.LINGJI_DIST_DIR)
  : path.join(ROOT, "dist");

fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(IMAGES_DIR, { recursive: true });

function loadSecret() {
  if (process.env.APP_SECRET && process.env.APP_SECRET.length >= 16) {
    return process.env.APP_SECRET;
  }
  if (fs.existsSync(SECRET_FILE)) {
    return fs.readFileSync(SECRET_FILE, "utf8").trim();
  }
  const secret = crypto.randomBytes(48).toString("base64url");
  fs.writeFileSync(SECRET_FILE, secret, { encoding: "utf8", mode: 0o600 });
  return secret;
}

export const APP_SECRET = loadSecret();
export const APP_VERSION = process.env.APP_VERSION || "1.2.0";
export const PORT = Number(process.env.PORT || 4173);
export const HOST = process.env.HOST || "127.0.0.1";
export const UPDATE_MANIFEST_URL = (
  process.env.UPDATE_MANIFEST_URL ||
  process.env.LINGJI_BUILTIN_UPDATE_URL ||
  ""
).trim();
export const IS_DEV = process.argv.includes("--dev");
// Never expose the well-known demo password on a public installation unless
// the operator explicitly asks for it. `pnpm dev` keeps the local demo account.
export const SEED_DEMO =
  process.env.SEED_DEMO === "true" ||
  (IS_DEV && process.env.SEED_DEMO !== "false");
export const COOKIE_NAME = "lingji_session";
export const SESSION_DAYS = 30;
export const MAX_TRANSCRIPT_CHARS = 120_000;
export const MAX_AUDIO_BYTES = 80 * 1024 * 1024;
