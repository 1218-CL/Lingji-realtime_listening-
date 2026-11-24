import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { IMAGES_DIR } from "./config.mjs";

export const MAX_LECTURE_IMAGES = 6;
export const MAX_MODEL_IMAGES = 2;

export function publicImage(lectureId, image) {
  return {
    id: image.id,
    mime: image.mime,
    size: image.size,
    createdAt: image.createdAt,
    url: `/api/lectures/${lectureId}/images/${image.id}`,
  };
}

export async function loadImagesForModel(lecture, limit = MAX_MODEL_IMAGES) {
  const images = Array.isArray(lecture.images) ? lecture.images.slice(-limit) : [];
  const loaded = [];
  let totalBytes = 0;
  for (const image of images) {
    try {
      const file = path.join(IMAGES_DIR, path.basename(lecture.id), path.basename(image.file));
      const data = await fsp.readFile(file);
      if (data.length > 4 * 1024 * 1024) continue;
      if (totalBytes + data.length > 8 * 1024 * 1024) break;
      loaded.push({ mime: image.mime || "image/jpeg", data });
      totalBytes += data.length;
    } catch {
      // A missing image should never block text analysis.
    }
  }
  return loaded;
}

export async function removeImagesForLecture(lecture) {
  if (!lecture?.images?.length) return;
  for (const image of lecture.images) {
    await fsp
      .unlink(path.join(IMAGES_DIR, path.basename(lecture.id), path.basename(image.file)))
      .catch(() => {});
  }
  await fsp.rmdir(path.join(IMAGES_DIR, path.basename(lecture.id))).catch(() => {});
}

export function ensureImageDir(lectureId) {
  const dir = path.join(IMAGES_DIR, path.basename(lectureId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
