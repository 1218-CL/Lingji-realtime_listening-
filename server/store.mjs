import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { DB_FILE, DATA_DIR } from "./config.mjs";

const emptyDb = () => ({
  version: 1,
  users: [],
  sessions: [],
  courses: [],
  lectures: [],
});

function normalizeDb(raw) {
  const base = emptyDb();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    users: Array.isArray(raw.users) ? raw.users : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    courses: Array.isArray(raw.courses) ? raw.courses : [],
    lectures: Array.isArray(raw.lectures) ? raw.lectures : [],
  };
}

export class Store {
  constructor(file = DB_FILE) {
    this.file = file;
    this.db = emptyDb();
    this.queue = Promise.resolve();
  }

  load() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (!fs.existsSync(this.file)) {
      this.db = emptyDb();
      this.saveSync();
      return this;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      this.db = normalizeDb(raw);
    } catch (error) {
      const backup = `${this.file}.broken-${Date.now()}`;
      fs.copyFileSync(this.file, backup);
      this.db = emptyDb();
      this.saveSync();
      console.warn(`[store] 数据文件无法读取，已备份到 ${backup}`);
    }
    return this;
  }

  saveSync() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }

  async save() {
    const tmp = `${this.file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(this.db, null, 2), "utf8");
    await fsp.rename(tmp, this.file);
  }

  /**
   * Serialize all mutations so two rapid transcript syncs cannot interleave.
   */
  update(mutator) {
    const run = async () => {
      const result = await mutator(this.db);
      await this.save();
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }
}

export function ensureDataDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
