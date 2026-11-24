import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Headphones, LoaderCircle, Mic2, ShieldCheck } from "lucide-react";
import { Modal } from "./Modal";
import { api, errorMessage } from "../lib/api";
import { useToast } from "../context/ToastContext";
import type { CourseSummary } from "../types";

interface StartLectureModalProps {
  open: boolean;
  courses: CourseSummary[];
  onClose: () => void;
}

export function StartLectureModal({ open, courses, onClose }: StartLectureModalProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [selectedId, setSelectedId] = useState<string>("");
  const [name, setName] = useState("");
  const [teacher, setTeacher] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const speechAvailable = useMemo(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    [],
  );

  useEffect(() => {
    if (!open) return;
    setSelectedId("");
    setName("");
    setTeacher("");
    setError("");
    setStarting(false);
  }, [open]);

  const selectCourse = (course: CourseSummary) => {
    setSelectedId(course.id);
    setName(course.name);
    setTeacher(course.teacher);
    setError("");
  };

  const handleStart = async () => {
    const courseName = name.trim();
    const teacherName = teacher.trim();
    if (!courseName || !teacherName) {
      setError("先填写课程名称和老师名字，再开始听课。");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("当前浏览器不支持麦克风录音，请使用最新版 Chrome 或 Edge。");
      return;
    }

    setStarting(true);
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      const selected = courses.find(
        (course) =>
          course.id === selectedId &&
          course.name === courseName &&
          course.teacher === teacherName,
      );
      const { lecture } = await api.createLecture(
        selected
          ? { courseId: selected.id }
          : { courseName, teacher: teacherName },
      );
      onClose();
      navigate(`/record/${lecture.id}`);
    } catch (err) {
      const message =
        err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError")
          ? "需要麦克风权限才能开始。请允许浏览器访问麦克风后再试。"
          : errorMessage(err);
      setError(message);
      setStarting(false);
    }
  };

  return (
    <Modal open={open} onClose={starting ? () => {} : onClose} className="start-modal" labelledBy="start-modal-title">
      <div className="start-modal-head">
        <span className="modal-eyebrow">
          <span className="live-dot" />
          NEW SESSION
        </span>
        <h2 id="start-modal-title">准备好，进入课堂</h2>
        <p>选择一门课程，或直接创建新的课堂记录。转写和纪要会随录音实时发生。</p>
      </div>

      {courses.length > 0 && (
        <div className="start-section">
          <div className="start-label">
            <span>选择已有课程</span>
            <em>{courses.length} 门</em>
          </div>
          <div className="start-course-list">
            {courses.map((course) => (
              <button
                key={course.id}
                className={`start-course ${selectedId === course.id ? "selected" : ""}`}
                onClick={() => selectCourse(course)}
                style={{ ["--course-color" as string]: course.color }}
              >
                <span className="start-course-mark">{course.name.slice(0, 1)}</span>
                <span className="start-course-text">
                  <strong>{course.name}</strong>
                  <span>{course.teacher} 老师</span>
                </span>
                <span className="start-course-radio" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="start-section">
        <div className="start-label">
          <span>{courses.length ? "或新建一门课" : "创建你的第一门课"}</span>
        </div>
        <div className="start-fields">
          <label className="field">
            <span>课程名称</span>
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (selectedId) setSelectedId("");
              }}
              placeholder="例如：认知心理学"
              maxLength={60}
            />
          </label>
          <label className="field">
            <span>老师名字</span>
            <input
              value={teacher}
              onChange={(event) => {
                setTeacher(event.target.value);
                if (selectedId) setSelectedId("");
              }}
              placeholder="例如：周未"
              maxLength={40}
            />
          </label>
        </div>
      </div>

      <div className="start-assurance">
        <ShieldCheck size={17} />
        <p>
          录音与课程数据只保存在你的个人空间。建议使用 <strong>Chrome / Edge</strong> 获得最佳后台转写效果。
        </p>
      </div>

      {!speechAvailable && (
        <div className="inline-warning">
          当前浏览器不支持 Web Speech 后台转写，但仍可录音和上传板书图片；建议改用 Chrome 或 Edge。
        </div>
      )}
      {error && <div className="inline-error">{error}</div>}

      <div className="start-actions">
        <button className="button ghost" onClick={onClose} disabled={starting}>
          取消
        </button>
        <button className="button primary" onClick={handleStart} disabled={starting}>
          {starting ? (
            <>
              <LoaderCircle size={17} className="spin" /> 正在准备麦克风…
            </>
          ) : (
            <>
              <Mic2 size={17} /> 开始听课
            </>
          )}
        </button>
      </div>

      <div className="start-modal-foot">
        <Headphones size={14} />
        <span>戴上耳机，收音会更清晰</span>
      </div>
    </Modal>
  );
}
