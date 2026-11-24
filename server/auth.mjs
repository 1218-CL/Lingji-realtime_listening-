import crypto from "node:crypto";
import { APP_SECRET, COOKIE_NAME, SESSION_DAYS } from "./config.mjs";

const SCRYPT_KEYLEN = 64;

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const actual = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function sessionExpiry() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt,
    isDemo: Boolean(user.isDemo),
  };
}

const encryptionKey = crypto.scryptSync(APP_SECRET, "lingji-api-key-v1", 32);

export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(value) {
  if (!value || typeof value !== "string") return "";
  try {
    const [ivRaw, tagRaw, dataRaw] = value.split(".");
    if (!ivRaw || !tagRaw || !dataRaw) return "";
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey,
      Buffer.from(ivRaw, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

export function getSessionUser(db, token) {
  if (!token) return null;
  const hashed = tokenHash(token);
  const now = Date.now();
  const session = db.sessions.find(
    (item) => item.tokenHash === hashed && new Date(item.expiresAt).getTime() > now,
  );
  if (!session) return null;
  return db.users.find((user) => user.id === session.userId) || null;
}

export function createSession(db, userId) {
  const token = createSessionToken();
  db.sessions.push({
    id: crypto.randomUUID(),
    userId,
    tokenHash: tokenHash(token),
    createdAt: new Date().toISOString(),
    expiresAt: sessionExpiry(),
  });
  // Opportunistic cleanup keeps the JSON store from growing forever.
  const now = Date.now();
  db.sessions = db.sessions.filter((item) => new Date(item.expiresAt).getTime() > now);
  return token;
}
