import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Clock3,
  MessageCircleQuestion,
  Mic2,
  Play,
  Radio,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, errorMessage } from "../lib/api";
import type { DashboardData } from "../types";
import {
  formatDuration,
  formatRelative,
  greeting,
  todayLabel,
} from "../lib/format";
import { CourseCard } from "../components/CourseCard";
import { StartLectureModal } from "../components/StartLectureModal";
import { Waveform } from "../components/Waveform";

export function HomePage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [startOpen, setStartOpen] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    api
      .dashboard()
      .then(setData)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const active = data?.activeLecture;

  return (
    <div className="home-page">
      <header className="welcome-row">
        <div>
          <span className="page-eyebrow">
            <CalendarDot />
            {todayLabel()}
          </span>
          <h1>
            {greeting()}，{user?.displayName}
            <span className="heading-dot">。</span>
          </h1>
        </div>
        <p className="welcome-note">
          {active ? "有一堂课还等着你回去。" : "今天想听点什么？把麦克风交给我。"}
        </p>
      </header>

      {active && (
        <Link to={`/record/${active.id}`} className="resume-banner">
          <span className="resume-pulse">
            <Radio size={15} />
          </span>
          <div>
            <strong>「{active.courseName}」的课堂还在进行</strong>
            <span>
              {active.title} · 开始于 {formatRelative(active.startedAt)}
            </span>
          </div>
          <span className="resume-action">
            继续记录 <ArrowRight size={15} />
          </span>
        </Link>
      )}

      <section className="home-hero">
        <div className="hero-noise" aria-hidden="true" />
        <div className="hero-copy">
          <span className="hero-eyebrow">
            <span className="live-dot light" />
            LIVE LECTURE COMPANION
          </span>
          <h2>
            此刻，
            <br />
            <em>专心听讲。</em>
          </h2>
          <p>
            把注意力留给老师。纪要和追问，
            <br className="desktop-only" />
            交给聆记同时完成。
          </p>

          <button className="hero-cta" onClick={() => setStartOpen(true)}>
            <Mic2 size={18} />
            开始一堂新课
            <ArrowRight size={17} />
          </button>

          <div className="hero-capabilities">
            <span>
              <Radio size={14} /> 后台转写
            </span>
            <span>
              <Sparkles size={14} /> 课堂纪要
            </span>
            <span>
              <MessageCircleQuestion size={14} /> 随堂追问
            </span>
          </div>
        </div>

        <div className="hero-stage">
          <div className="hero-orbit orbit-one" aria-hidden="true" />
          <div className="hero-orbit orbit-two" aria-hidden="true" />
          <span className="floating-chip chip-transcribe">
            <span className="mini-wave">
              <i />
              <i />
              <i />
              <i />
            </span>
            正在聆听
          </span>
          <span className="floating-chip chip-note">
            <Sparkles size={13} />
            纪要已更新
          </span>

          <button
            className="mic-orb"
            onClick={() => setStartOpen(true)}
            aria-label="开始新课堂录音"
          >
            <span className="mic-orb-ring ring-a" />
            <span className="mic-orb-ring ring-b" />
            <span className="mic-orb-ring ring-c" />
            <span className="mic-orb-core">
              <Mic2 size={46} strokeWidth={1.55} />
            </span>
          </button>

          <div className="mic-caption">
            <strong>点击开始听课</strong>
            <span>选择课程与老师，然后开口</span>
          </div>

          <div className="hero-waveform">
            <Waveform analyser={null} active={false} color="#8ae4df" height={46} bars={52} />
          </div>
        </div>

        <div className="hero-metrics">
          <div>
            <span>累计听讲</span>
            <strong>
              {loading ? "—" : (data?.stats.totalHours ?? 0).toFixed(1)}
              <em>小时</em>
            </strong>
          </div>
          <div>
            <span>课程</span>
            <strong>
              {loading ? "—" : data?.stats.courses ?? 0}
              <em>门</em>
            </strong>
          </div>
          <div>
            <span>课堂记录</span>
            <strong>
              {loading ? "—" : data?.stats.lectures ?? 0}
              <em>节</em>
            </strong>
          </div>
          <div className="hero-metric-note">
            <span className="metric-spark">
              <Sparkles size={14} />
            </span>
            <p>
              每堂课的转写与纪要
              <br />
              都会自动收进你的空间
            </p>
          </div>
        </div>
      </section>

      {error && (
        <div className="load-error">
          <div>
            <strong>没能加载你的课堂</strong>
            <span>{error}</span>
          </div>
          <button className="button ghost small" onClick={load}>
            重新加载
          </button>
        </div>
      )}

      <div className="home-lower">
        <section className="home-courses">
          <div className="section-head">
            <div>
              <span className="section-kicker">YOUR LIBRARY</span>
              <h2>我的课程</h2>
            </div>
            <Link to="/space" className="section-link">
              全部课程 <ChevronRight size={16} />
            </Link>
          </div>

          {loading ? (
            <div className="course-grid">
              {[0, 1, 2].map((item) => (
                <div className="course-card course-skeleton" key={item}>
                  <div className="skeleton-line w-56" />
                  <div className="skeleton-line w-84" />
                  <div className="skeleton-line w-70" />
                </div>
              ))}
            </div>
          ) : data?.courses.length ? (
            <div className="course-grid">
              {data.courses.slice(0, 3).map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          ) : (
            <div className="empty-card">
              <span className="empty-icon">
                <BookOpen size={23} />
              </span>
              <div>
                <strong>你的课程书架还是空的</strong>
                <p>按下麦克风，第一堂课就会自动成为一门课程。</p>
              </div>
              <button className="button primary small" onClick={() => setStartOpen(true)}>
                <Mic2 size={15} /> 开始听课
              </button>
            </div>
          )}
        </section>

        <aside className="home-recent">
          <div className="section-head">
            <div>
              <span className="section-kicker">PICK UP</span>
              <h2>最近回听</h2>
            </div>
          </div>

          {loading ? (
            <div className="recent-list">
              {[0, 1, 2].map((item) => (
                <div className="recent-item skeleton-item" key={item}>
                  <div className="skeleton-line w-84" />
                  <div className="skeleton-line w-56" />
                </div>
              ))}
            </div>
          ) : data?.recentLectures.length ? (
            <div className="recent-list">
              {data.recentLectures.map((lecture) => (
                <Link to={`/lecture/${lecture.id}`} className="recent-item" key={lecture.id}>
                  <span className="recent-play">
                    <Play size={13} fill="currentColor" />
                  </span>
                  <div className="recent-copy">
                    <span className="recent-course">
                      {lecture.courseName} · {lecture.teacher}
                    </span>
                    <strong>{lecture.title}</strong>
                    <span className="recent-meta">
                      <Clock3 size={12} />
                      {formatDuration(lecture.durationSec)}
                      <em>·</em>
                      {formatRelative(lecture.startedAt)}
                    </span>
                  </div>
                  <ArrowUpRight size={15} className="recent-arrow" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="recent-empty">
              <Clock3 size={20} />
              <p>结束第一堂课后，最近记录会出现在这里。</p>
            </div>
          )}

          <button className="recent-new" onClick={() => setStartOpen(true)}>
            <span>
              <Mic2 size={16} />
            </span>
            <div>
              <strong>开始记录新课堂</strong>
              <small>后台转写，点击「更新摘要」生成纪要</small>
            </div>
            <ChevronRight size={16} />
          </button>
        </aside>
      </div>

      <StartLectureModal
        open={startOpen}
        courses={data?.courses || []}
        onClose={() => setStartOpen(false)}
      />
    </div>
  );
}

function CalendarDot() {
  const date = new Date();
  return (
    <span className="calendar-dot" aria-hidden="true">
      {date.getDate()}
    </span>
  );
}
