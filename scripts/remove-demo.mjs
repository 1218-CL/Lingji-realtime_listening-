import fs from "node:fs";
import path from "node:path";
import { DB_FILE, AUDIO_DIR } from "../server/config.mjs";

if (!process.argv.includes("--yes")) {
  console.error(
    [
      "这个脚本会永久删除 demo 账号及其示例课程、课堂与录音。",
      "请先停止服务，确认数据已备份，然后执行：",
      "  node scripts/remove-demo.mjs --yes",
    ].join("\n"),
  );
  process.exit(1);
}

if (!fs.existsSync(DB_FILE)) {
  console.error(`找不到数据文件：${DB_FILE}`);
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
const demo = (db.users || []).find((user) => user.username === "demo" && user.isDemo);
if (!demo) {
  console.log("没有找到 demo 账号，无需清理。");
  process.exit(0);
}

const courses = (db.courses || []).filter((course) => course.userId === demo.id);
const courseIds = new Set(courses.map((course) => course.id));
const lectures = (db.lectures || []).filter(
  (lecture) => lecture.userId === demo.id || courseIds.has(lecture.courseId),
);

let removedAudio = 0;
for (const lecture of lectures) {
  if (!lecture.audio?.file) continue;
  const target = path.join(AUDIO_DIR, path.basename(lecture.audio.file));
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
    removedAudio += 1;
  }
}

db.users = (db.users || []).filter((user) => user.id !== demo.id);
db.sessions = (db.sessions || []).filter((session) => session.userId !== demo.id);
db.courses = (db.courses || []).filter((course) => !courseIds.has(course.id));
db.lectures = (db.lectures || []).filter(
  (lecture) => lecture.userId !== demo.id && !courseIds.has(lecture.courseId),
);

const temp = `${DB_FILE}.tmp`;
fs.writeFileSync(temp, JSON.stringify(db, null, 2), "utf8");
fs.renameSync(temp, DB_FILE);

console.log(
  `已删除 demo 账号、${courses.length} 门示例课程、${lectures.length} 条课堂和 ${removedAudio} 个录音文件。`,
);
