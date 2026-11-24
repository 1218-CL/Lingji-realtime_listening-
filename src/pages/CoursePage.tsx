import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  CalendarDays,
  Clock3,
  Headphones,
  LoaderCircle,
  Mic2,
  MoreHorizontal,
  Radio,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api, errorMessage } from "../lib/api";
import type { CourseSummary, LectureSummary, TeacherProfile } from "../types";
import { useToast } from "../context/ToastContext";
import { Modal } from "../components/Modal";
import { TeacherProfilePanel } from "../components/TeacherProfilePanel";
import {
  formatDate,
  formatDuration,
  formatReadableDuration,
  formatRelative,
  formatTimeOfDay,
} from "../lib/format";

export function CoursePage() {
  const { courseId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const [course, setCourse] = useState<CourseSummary | null>(null);
  const [lectures, setLectures] = useState<LectureSummary[]>([]);
  const [teacherProfile, setTeacherProfile] = useState<TeacherProfile | null>(null);
  const [profileGenerating, setProfileGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setLoading(true);
    setError("");
    api
      .course(courseId)
      .then((result) => {
        setCourse(result.course);
        setLectures(result.lectures);
        setTeacherProfile(result.teacherProfile);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [courseId]);

  useEffect(() => {
    if (loading || location.hash !== "#teacher-profile") return;
    const timer = window.setTimeout(() => {
      document.getElementById("teacher-profile")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [loading, location.hash]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const startLecture = async () => {
    if (!course || starting) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast("当前浏览器不支持麦克风录音，请使用 Chrome 或 Edge。", "error");
      return;
    }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      const { lecture } = await api.createLecture({ courseId: course.id });
      navigate(`/record/${lecture.id}`);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "麦克风权限被拒绝，请在浏览器地址栏允许后重试。"
          : errorMessage(err);
      showToast(message, "error");
      setStarting(false);
    }
  };

  const generateTeacherProfile = async () => {
    if (!course || profileGenerating) return;
    setProfileGenerating(true);
    try {
      const result = await api.generateTeacherProfile(course.id);
      setTeacherProfile(result.profile);
      showToast(
        result.warning || "老师画像与听课建议已生成。",
        result.warning ? "info" : "success",
      );
    } catch (err) {
      showToast(errorMessage(err), "error");
    } finally {
      setProfileGenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!course) return;
    setDeleting(true);
    try {
      await api.deleteCourse(course.id);
      showToast("课程已删除。", "success");
      navigate("/space", { replace: true });
    } catch (err) {
      showToast(errorMessage(err), "error");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="course-page course-loading">
        <div className="skeleton-line w-40" />
        <div className="skeleton-hero" />
        <div className="skeleton-line w-70" />
        <div className="skeleton-block" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="course-page">
        <div className="fatal-card">
          <div className="fatal-icon">
            <Headphones size={26} />
          </div>
          <h1>没有找到这门课程</h1>
          <p>{error || "它可能已经被删除，或者不属于当前账号。"}</p>
          <Link to="/space" className="button primary">
            回到我的空间
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="course-page" style={{ ["--course-color" as string]: course.color }}>
      <Link to="/space" className="back-link">
        <ArrowLeft size={16} /> 我的课堂空间
      </Link>

      <header className="course-hero">
        <div className="course-hero-glow" aria-hidden="true" />
        <div className="course-identity">
          <span className="course-hero-mark">{course.name.slice(0, 1)}</span>
          <div>
            <span className="page-eyebrow light">COURSE · {course.teacher.toUpperCase()}</span>
            <h1>{course.name}</h1>
            <p>
              {course.teacher} 老师
              <span className="meta-dot">·</span>
              {course.lectureCount} 堂课
              <span className="meta-dot">·</span>
              {formatReadableDuration(course.totalSeconds)}听讲
            </p>
          </div>
        </div>

        <div className="course-hero-actions">
          <button className="button light-button" onClick={startLecture} disabled={starting}>
            {starting ? <LoaderCircle size={17} className="spin" /> : <Mic2 size={17} />}
            {starting ? "准备中…" : "开始新课堂"}
          </button>
          <div className="course-menu-wrap" ref={menuRef}>
            <button
              className="icon-button on-dark"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label="课程更多操作"
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <div className="course-menu">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 size={15} /> 删除课程
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="course-hero-stats">
          <div>
            <span>最近上课</span>
            <strong>{formatRelative(course.lastLectureAt)}</strong>
          </div>
          <div>
            <span>核心概念</span>
            <strong>{course.keywords.length ? course.keywords.join(" · ") : "等待积累"}</strong>
          </div>
          <div className="course-hero-tip">
            <Sparkles size={15} />
            <span>纪要和转写会附在每堂课后</span>
          </div>
        </div>
      </header>

      <TeacherProfilePanel
        course={course}
        profile={teacherProfile}
        lectureCount={lectures.length}
        segmentCount={lectures.reduce((sum, lecture) => sum + lecture.segmentCount, 0)}
        generating={profileGenerating}
        onGenerate={generateTeacherProfile}
      />

      <div className="lecture-section-head">
        <div>
          <span className="section-kicker">LECTURE ARCHIVE</span>
          <h2>课堂记录</h2>
        </div>
        <span className="lecture-count">{lectures.length} 条</span>
      </div>

      {lectures.length ? (
        <div className="lecture-list">
          {lectures.map((lecture, index) => (
            <Link
              to={lecture.status === "recording" ? `/record/${lecture.id}` : `/lecture/${lecture.id}`}
              className="lecture-row"
              key={lecture.id}
              style={{ animationDelay: `${index * 45}ms` }}
            >
              <div className="lecture-date">
                <span>
                  {new Intl.DateTimeFormat("zh-CN", { month: "short" }).format(
                    new Date(lecture.startedAt),
                  )}
                </span>
                <strong>
                  {new Intl.DateTimeFormat("zh-CN", { day: "2-digit" }).format(
                    new Date(lecture.startedAt),
                  )}
                </strong>
                <em>{formatTimeOfDay(lecture.startedAt)}</em>
              </div>

              <div className="lecture-main">
                <div className="lecture-title-row">
                  <h3>{lecture.title}</h3>
                  {lecture.status === "recording" && (
                    <span className="status-badge live">
                      <Radio size={11} /> 进行中
                    </span>
                  )}
                  {lecture.hasAudio && (
                    <span className="status-badge">
                      <AudioLines size={11} /> 有录音
                    </span>
                  )}
                </div>
                <p className="lecture-summary">
                  {lecture.note?.summary || "这堂课还没有生成纪要，点击进入查看转写。"}
                </p>
                <div className="lecture-meta">
                  <span>
                    <Clock3 size={13} /> {formatDuration(lecture.durationSec)}
                  </span>
                  <span>
                    <CalendarDays size={13} /> {formatDate(lecture.startedAt)}
                  </span>
                  {lecture.note?.keywords?.slice(0, 3).map((keyword) => (
                    <span className="lecture-keyword" key={keyword}>
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>

              <span className="lecture-enter">
                {lecture.status === "recording" ? <ArrowRight size={17} /> : <ArrowUpRight size={17} />}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="course-empty">
          <div className="empty-orbit-wrap">
            <span className="empty-orbit orbit-one" />
            <span className="empty-orbit orbit-two" />
            <Mic2 size={30} />
          </div>
          <h2>这门课还没有课堂记录</h2>
          <p>按下开始，把第一堂课的声音、转写和纪要一起留下来。</p>
          <button className="button primary" onClick={startLecture} disabled={starting}>
            <Mic2 size={16} /> 开始第一堂课
          </button>
        </div>
      )}

      <Modal
        open={deleteOpen}
        onClose={deleting ? () => {} : () => setDeleteOpen(false)}
        className="confirm-modal"
        labelledBy="delete-course-title"
      >
        <div className="confirm-icon danger">
          <Trash2 size={22} />
        </div>
        <h2 id="delete-course-title">删除「{course.name}」？</h2>
        <p>
          这门课下的 <strong>{lectures.length} 条课堂记录</strong>
          、转写、纪要和录音都会一起删除，且无法恢复。
        </p>
        <div className="modal-actions">
          <button className="button ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
            保留课程
          </button>
          <button className="button danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}
            确认删除
          </button>
        </div>
      </Modal>
    </div>
  );
}
