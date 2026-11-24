import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Clock3,
  LibraryBig,
  LoaderCircle,
  Mic2,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { api, errorMessage } from "../lib/api";
import type { CourseSummary } from "../types";
import { useToast } from "../context/ToastContext";
import { CourseCard } from "../components/CourseCard";
import { Modal } from "../components/Modal";
import { formatReadableDuration } from "../lib/format";

export function SpacePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [teacher, setTeacher] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    api
      .courses()
      .then((result) => setCourses(result.courses))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return courses;
    return courses.filter(
      (course) =>
        course.name.toLowerCase().includes(keyword) ||
        course.teacher.toLowerCase().includes(keyword),
    );
  }, [courses, query]);

  const totals = useMemo(() => {
    return courses.reduce(
      (acc, course) => ({
        lectures: acc.lectures + course.lectureCount,
        seconds: acc.seconds + course.totalSeconds,
      }),
      { lectures: 0, seconds: 0 },
    );
  }, [courses]);

  const filteredSeconds = useMemo(
    () => filtered.reduce((sum, course) => sum + course.totalSeconds, 0),
    [filtered],
  );

  const openCreate = () => {
    setName("");
    setTeacher("");
    setFormError("");
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!name.trim() || !teacher.trim()) {
      setFormError("请填写课程名称和老师名字。");
      return;
    }
    setCreating(true);
    setFormError("");
    try {
      const result = await api.createCourse(name.trim(), teacher.trim());
      showToast(result.created ? "课程已创建。" : "已找到同名课程。", "success");
      setCreateOpen(false);
      navigate(`/space/${result.course.id}`);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-page">
      <header className="space-hero">
        <div className="space-hero-copy">
          <span className="page-eyebrow">
            <LibraryBig size={14} />
            YOUR LEARNING SPACE
          </span>
          <h1>
            我的<span>课堂空间</span>
          </h1>
          <p>所有课程、录音和课堂纪要都安静地收在这里，随时可以回去补上没听懂的那一句。</p>
          <div className="space-actions">
            <button className="button primary" onClick={openCreate}>
              <Plus size={17} /> 新建课程
            </button>
            <button className="button ghost" onClick={() => navigate("/")}>
              <Mic2 size={16} /> 开始听课
            </button>
          </div>
        </div>

        <div className="space-summary">
          <div className="space-summary-orb" aria-hidden="true">
            <span className="summary-ring" />
            <span className="summary-core">
              <BookOpen size={27} />
            </span>
          </div>
          <div className="space-stats">
            <div>
              <strong>{courses.length}</strong>
              <span>门课程</span>
            </div>
            <div>
              <strong>{totals.lectures}</strong>
              <span>条课堂记录</span>
            </div>
            <div>
              <strong>{Math.round((totals.seconds / 3600) * 10) / 10}</strong>
              <span>小时听讲</span>
            </div>
          </div>
        </div>
      </header>

      <div className="space-toolbar">
        <div className="space-tabs">
          <button className="active">
            全部课程 <em>{courses.length}</em>
          </button>
          <span className="toolbar-note">
            <Sparkles size={13} /> 按最近更新排序
          </span>
        </div>
        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索课程或老师…"
            aria-label="搜索课程或老师"
          />
          {query && <button onClick={() => setQuery("")}>清除</button>}
        </label>
      </div>

      {error && (
        <div className="load-error">
          <div>
            <strong>课程加载失败</strong>
            <span>{error}</span>
          </div>
          <button className="button ghost small" onClick={load}>
            重试
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-course-grid">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div className="course-card course-skeleton" key={item}>
              <div className="skeleton-line w-56" />
              <div className="skeleton-line w-84" />
              <div className="skeleton-line w-70" />
              <div className="skeleton-line w-40" />
            </div>
          ))}
        </div>
      ) : filtered.length ? (
        <>
          {query && (
            <div className="space-result-line">
              <span>
                “{query}” 的搜索结果
                <em>{filtered.length}</em>
              </span>
              <span>
                <Clock3 size={13} /> 共 {formatReadableDuration(filteredSeconds)}
              </span>
            </div>
          )}
          <div className="space-course-grid">
            {filtered.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
            <button className="new-course-card" onClick={openCreate}>
              <span className="new-course-plus">
                <Plus size={22} />
              </span>
              <strong>新建一门课程</strong>
              <span>从第一堂课开始积累</span>
            </button>
          </div>
        </>
      ) : (
        <div className="space-empty">
          <div className="space-empty-visual">
            <span className="empty-orbit orbit-one" />
            <span className="empty-orbit orbit-two" />
            <LibraryBig size={34} />
          </div>
          <h2>{query ? "没有找到这门课" : "书架还是空的"}</h2>
          <p>
            {query
              ? "试试换一个关键词，或者直接新建这门课程。"
              : "按下麦克风开始第一堂课，或者先手动创建一门课程。"}
          </p>
          <div>
            <button className="button primary" onClick={query ? () => setQuery("") : openCreate}>
              {query ? "清除搜索" : "新建课程"}
            </button>
            <button className="button ghost" onClick={() => navigate("/")}>
              去听课 <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={creating ? () => {} : () => setCreateOpen(false)}
        className="create-course-modal"
        labelledBy="create-course-title"
      >
        <div className="modal-form-head">
          <span className="modal-eyebrow">NEW COURSE</span>
          <h2 id="create-course-title">新建一门课程</h2>
          <p>课程是课堂记录的书架。之后录音时也可以直接创建。</p>
        </div>
        <div className="modal-fields">
          <label className="field">
            <span>课程名称</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：传播学概论"
              maxLength={60}
            />
          </label>
          <label className="field">
            <span>老师名字</span>
            <input
              value={teacher}
              onChange={(event) => setTeacher(event.target.value)}
              placeholder="例如：陈砚"
              maxLength={40}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleCreate();
              }}
            />
          </label>
        </div>
        {formError && <div className="inline-error">{formError}</div>}
        <div className="modal-actions">
          <button className="button ghost" onClick={() => setCreateOpen(false)} disabled={creating}>
            取消
          </button>
          <button className="button primary" onClick={handleCreate} disabled={creating}>
            {creating ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />}
            {creating ? "创建中…" : "创建课程"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
