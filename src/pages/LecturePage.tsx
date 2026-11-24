import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  AudioLines,
  CalendarDays,
  Check,
  Clock3,
  Copy,
  Download,
  GraduationCap,
  Headphones,
  ImageIcon,
  LoaderCircle,
  MessageCircleQuestion,
  MoreHorizontal,
  Network,
  Play,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { useToast } from "../context/ToastContext";
import type { ChatMessage, LectureDetail, LectureNote } from "../types";
import {
  downloadText,
  formatClock,
  formatDate,
  formatDateTime,
  formatDuration,
} from "../lib/format";
import { Modal } from "../components/Modal";
import { ChatPanel } from "../components/ChatPanel";
import { DiagramModal, type DiagramTarget } from "../components/DiagramModal";
import { SectionSummaryList } from "../components/SectionSummaryList";
import { ImageAttachments } from "../components/ImageAttachments";

const sourceLabels: Record<string, string> = {
  ai: "AI 纪要",
  local: "本地纪要",
  demo: "示例纪要",
};

function buildMarkdown(lecture: LectureDetail, note: LectureNote | null): string {
  const lines: string[] = [];
  lines.push(`# ${lecture.title}`);
  lines.push("");
  lines.push(`- 课程：${lecture.courseName}`);
  lines.push(`- 老师：${lecture.teacher}`);
  lines.push(`- 时间：${formatDateTime(lecture.startedAt)}`);
  lines.push(`- 时长：${formatDuration(lecture.durationSec)}`);
  lines.push("");
  if (note) {
    lines.push("## 课堂摘要");
    lines.push("");
    lines.push(note.summary);
    lines.push("");
    if (note.sections?.length) {
      lines.push("## 分段摘要");
      lines.push("");
      [...note.sections]
        .sort((a, b) => a.index - b.index)
        .forEach((section) => {
          const range = section.endSec ? ` · ${formatClock(section.startSec)}–${formatClock(section.endSec)}` : "";
          lines.push(`### ${section.title}${range}`);
          lines.push("");
          lines.push(section.summary);
          lines.push("");
          section.points?.forEach((point) => lines.push(`- ${point}`));
          lines.push("");
        });
    }
    lines.push("## 重点脉络");
    lines.push("");
    note.keyPoints.forEach((point, index) => lines.push(`${index + 1}. ${point}`));
    lines.push("");
    lines.push("## 核心概念");
    lines.push("");
    lines.push(note.keywords.map((keyword) => `\`${keyword}\``).join(" · "));
    lines.push("");
    lines.push("## 值得追问");
    lines.push("");
    note.questions.forEach((question) => lines.push(`- ${question}`));
    lines.push("");
  }
  lines.push("## 完整转写");
  lines.push("");
  lecture.segments.forEach((segment) => {
    lines.push(`**${formatClock(segment.at)}** ${segment.text}`);
    lines.push("");
  });
  const assistantMessages = lecture.chat.filter((message) => message.role === "assistant");
  if (assistantMessages.length) {
    lines.push("## 随堂问答");
    lines.push("");
    assistantMessages.forEach((message) => {
      lines.push(message.content);
      lines.push("");
    });
  }
  lines.push("---");
  lines.push("由 聆记 LingJi 生成 · 请尊重老师的知识产权");
  return lines.join("\n");
}

export function LecturePage() {
  const { lectureId = "" } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [lecture, setLecture] = useState<LectureDetail | null>(null);
  const [note, setNote] = useState<LectureNote | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  const [llmConfigured, setLlmConfigured] = useState(false);
  const [chatSource, setChatSource] = useState<"ai" | "local">("local");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [diagramTarget, setDiagramTarget] = useState<DiagramTarget | null>(null);
  const streamingRef = useRef(false);
  const chatAbortRef = useRef<AbortController | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .lecture(lectureId)
      .then(({ lecture: value }) => {
        setLecture(value);
        setNote(value.note);
        setMessages(value.chat);
        document.title = `${value.title} · 聆记`;
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [lectureId]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    api
      .settings()
      .then((result) => {
        setLlmConfigured(result.llm.configured);
        setChatSource(result.llm.configured ? "ai" : "local");
      })
      .catch(() => {});
  }, []);

  const generateNotes = useCallback(async () => {
    if (!lecture || analyzing) return;
    const transcript = lecture.segments.map((segment) => segment.text).join("");
    if (transcript.trim().length < 20) {
      showToast("这堂课还没有足够的转写内容。", "info");
      return;
    }
    setAnalyzing(true);
    try {
      const result = await api.notes(lectureId, transcript, undefined, false, true);
      setNote(result.note);
      setLecture((current) =>
        current ? { ...current, note: result.note } : current,
      );
      setChatSource((current) =>
        result.source === "ai" ? "ai" : current === "ai" ? "local" : current,
      );
      if (result.warning) showToast(result.warning, "info");
      else showToast("纪要已重新整理。", "success");
    } catch (err) {
      showToast(errorMessage(err), "error");
    } finally {
      setAnalyzing(false);
    }
  }, [analyzing, lecture, lectureId, showToast]);

  const handleAsk = async (question: string) => {
    if (!lecture || streamingRef.current) return;
    const clean = question.trim();
    if (!clean) return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: clean,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, userMessage]);
    streamingRef.current = true;
    setStreaming(true);
    setStreamingText("");
    const controller = new AbortController();
    chatAbortRef.current = controller;
    let accumulated = "";
    try {
      await api.chatStream(
        lectureId,
        clean,
        lecture.segments.map((segment) => segment.text).join(""),
        {
          onSource: (payload) => {
            setChatSource(payload.source);
            if (payload.warning) showToast(payload.warning, "info");
          },
          onDelta: (text) => {
            accumulated += text;
            setStreamingText(accumulated);
          },
          onDone: (payload) => {
            setChatSource(payload.source);
            setMessages((current) => [
              ...current,
              {
                id: payload.messageId,
                role: "assistant",
                content: payload.content || accumulated,
                createdAt: new Date().toISOString(),
                source: payload.source,
              },
            ]);
            if (payload.warning) showToast(payload.warning, "info");
          },
          onError: (message) => showToast(message, "error"),
        },
        controller.signal,
      );
    } catch (err) {
      if (!controller.signal.aborted) showToast(errorMessage(err), "error");
    } finally {
      streamingRef.current = false;
      setStreaming(false);
      setStreamingText("");
      chatAbortRef.current = null;
    }
  };

  const copyTranscript = async () => {
    if (!lecture) return;
    const value = lecture.segments
      .map((segment) => `[${formatClock(segment.at)}] ${segment.text}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      showToast("完整转写已复制。", "success");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast("复制失败，请手动选择文字。", "error");
    }
  };

  const exportMarkdown = () => {
    if (!lecture) return;
    const content = buildMarkdown({ ...lecture, chat: messages }, note);
    const filename = `${lecture.courseName}-${lecture.title}`.replace(/[\\/:*?"<>|]/g, "-");
    downloadText(`${filename}.md`, content);
    showToast("Markdown 笔记已导出。", "success");
  };

  const handleDelete = async () => {
    if (!lecture) return;
    setDeleting(true);
    try {
      await api.deleteLecture(lecture.id);
      showToast("课堂记录已删除。", "success");
      navigate(`/space/${lecture.courseId}`, { replace: true });
    } catch (err) {
      showToast(errorMessage(err), "error");
      setDeleting(false);
    }
  };

  useEffect(() => {
    return () => chatAbortRef.current?.abort();
  }, []);

  if (loading) {
    return (
      <div className="lecture-page lecture-loading">
        <div className="skeleton-line w-40" />
        <div className="skeleton-hero" />
        <div className="review-loading-grid">
          <div className="skeleton-block" />
          <div className="skeleton-block" />
        </div>
      </div>
    );
  }

  if (error || !lecture) {
    return (
      <div className="lecture-page">
        <div className="fatal-card">
          <div className="fatal-icon">
            <Headphones size={26} />
          </div>
          <h1>这堂课暂时打不开</h1>
          <p>{error || "课堂记录可能已被删除。"}</p>
          <Link to="/space" className="button primary">
            回到我的空间
          </Link>
        </div>
      </div>
    );
  }

  const active = lecture.status === "recording";
  const noteQuestions = note?.questions || [];

  return (
    <div className="lecture-page">
      <div className="review-topbar">
        <Link
          to={lecture.course ? `/space/${lecture.course.id}` : "/space"}
          className="back-link"
        >
          <ArrowLeft size={16} /> {lecture.courseName}
        </Link>
        <div className="review-actions">
          <button className="button ghost small" onClick={copyTranscript}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "已复制" : "复制转写"}
          </button>
          <button className="button ghost small" onClick={exportMarkdown}>
            <Download size={15} /> 导出笔记
          </button>
          <div className="review-menu-wrap" ref={menuRef}>
            <button
              className="icon-button"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label="更多操作"
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
                  <Trash2 size={15} /> 删除这堂课
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {active && (
        <div className="review-live-banner">
          <span className="recording-badge recording">
            <span className="record-dot" /> 课堂进行中
          </span>
          <p>这堂课还没有结束，目前保存的是后台转写与阶段纪要。</p>
          <button className="button primary small" onClick={() => navigate(`/record/${lecture.id}`)}>
            继续记录 <ArrowUpRight size={14} />
          </button>
        </div>
      )}

      <header className="review-hero">
        <div className="review-hero-main">
          <div className="review-course-line">
            <span
              className="review-course-dot"
              style={{ background: lecture.course?.color || "#027789" }}
            />
            <span>{lecture.courseName}</span>
            <em>·</em>
            <span>{lecture.teacher} 老师</span>
          </div>
          <h1>{lecture.title}</h1>
          <div className="review-meta">
            <span>
              <CalendarDays size={14} /> {formatDate(lecture.startedAt)}
            </span>
            <span>
              <Clock3 size={14} /> {formatDuration(lecture.durationSec)}
            </span>
            <span>
              <MessageCircleQuestion size={14} /> {messages.length} 条问答
            </span>
            {lecture.imageCount > 0 && (
              <span>
                <ImageIcon size={14} /> {lecture.imageCount} 张图片
              </span>
            )}
            {lecture.hasAudio && (
              <span className="audio-chip">
                <AudioLines size={14} /> 有课堂录音
              </span>
            )}
          </div>

          {note ? (
            <div className="review-summary">
              <div className="review-summary-head">
                <span className="summary-label">
                  <Sparkles size={14} /> {sourceLabels[note.source] || "课堂纪要"}
                </span>
                <button
                  className="diagram-trigger"
                  onClick={() =>
                    setDiagramTarget({ scope: "overall", label: "整堂课" })
                  }
                  title="把整堂课的摘要梳理成逻辑示意图"
                >
                  <Network size={14} /> 示意图
                </button>
              </div>
              <p>{note.summary}</p>
              <div className="review-keywords">
                {note.keywords.map((keyword) => (
                  <span key={keyword}>{keyword}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="review-summary empty">
              <span className="summary-label">
                {analyzing ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}
                {analyzing ? "正在生成课堂纪要…" : "还没有生成纪要"}
              </span>
              <p>转写已经完整保存，可以让 AI 再整理一次重点与概念。</p>
              {!analyzing && (
                <button className="button primary small" onClick={() => void generateNotes()}>
                  <Sparkles size={15} /> 生成课堂纪要
                </button>
              )}
            </div>
          )}

          <div className="review-images">
            <div className="review-images-head">
              <span>
                <ImageIcon size={15} /> 板书与课堂图片
              </span>
              <em>可随纪要一起交给 AI 理解</em>
            </div>
            <ImageAttachments
              lectureId={lecture.id}
              images={lecture.images || []}
              onChange={(images) =>
                setLecture((current) =>
                  current
                    ? { ...current, images, imageCount: images.length }
                    : current,
                )
              }
              onUploaded={() => {
                showToast("图片已添加；需要时点「重新分析」把它纳入摘要。", "info");
              }}
            />
          </div>
        </div>

        <div className="review-hero-side">
          <div className="review-seal">
            <span className="review-seal-ring" />
            <span className="review-seal-core">{lecture.courseName.slice(0, 1)}</span>
            <em>CLASS NOTE</em>
          </div>
          {lecture.hasAudio && (
            <div className="audio-player">
              <div className="audio-player-head">
                <span className="audio-icon">
                  <Play size={14} fill="currentColor" />
                </span>
                <div>
                  <strong>课堂录音</strong>
                  <span>{formatDuration(lecture.durationSec)}</span>
                </div>
              </div>
              <audio controls preload="metadata" src={api.audioUrl(lecture.id)}>
                你的浏览器不支持音频播放。
              </audio>
            </div>
          )}
        </div>
      </header>

      <div className="review-grid">
        <main className="review-main">
          {note?.sections?.length ? (
            <section className="panel review-sections-panel">
              <div className="panel-head">
                <div className="panel-title">
                  <span className="icon-badge icon-badge-teal">
                    <Network size={17} />
                  </span>
                  <div>
                    <h2>分段摘要</h2>
                    <p>每次更新摘要时留下的阶段性回顾，最新在前</p>
                  </div>
                </div>
                <span className="review-sections-count">{note.sections.length} 段</span>
              </div>
              <SectionSummaryList
                sections={[...note.sections].reverse()}
                onDiagram={(section) =>
                  setDiagramTarget({
                    scope: "section",
                    sectionId: section.id,
                    label: section.title,
                  })
                }
              />
            </section>
          ) : null}

          <section className="panel review-note-panel">
            <div className="panel-head">
              <div className="panel-title">
                <span className="icon-badge icon-badge-teal">
                  <Sparkles size={17} />
                </span>
                <div>
                  <h2>重点脉络</h2>
                  <p>从这堂课里提炼出的关键内容</p>
                </div>
              </div>
              <button
                className="button ghost small"
                onClick={() => void generateNotes()}
                disabled={analyzing}
              >
                {analyzing ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                {analyzing ? "整理中" : "重新整理"}
              </button>
            </div>

            {note?.keyPoints?.length ? (
              <ol className="review-points">
                {note.keyPoints.map((point, index) => (
                  <li key={point}>
                    <span className="review-point-index">{String(index + 1).padStart(2, "0")}</span>
                    <p>{point}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="review-note-empty">
                {analyzing ? (
                  <div className="note-skeleton">
                    <div className="skeleton-line w-90" />
                    <div className="skeleton-line w-70" />
                    <div className="skeleton-block" />
                  </div>
                ) : (
                  <p>还没有重点提炼。点击右上角「重新整理」生成。</p>
                )}
              </div>
            )}

            {noteQuestions.length > 0 && (
              <div className="review-questions">
                <div className="note-section-title">
                  <span>继续追问</span>
                  <em>基于这堂课</em>
                </div>
                <div className="review-question-grid">
                  {noteQuestions.map((question) => (
                    <button key={question} onClick={() => void handleAsk(question)}>
                      <MessageCircleQuestion size={15} />
                      <span>{question}</span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="panel review-transcript-panel">
            <div className="panel-head">
              <div className="panel-title">
                <span className="icon-badge icon-badge-blue">
                  <AudioLines size={17} />
                </span>
                <div>
                  <h2>完整转写</h2>
                  <p>
                    {lecture.segments.length} 段 ·{" "}
                    {lecture.segments.reduce((sum, segment) => sum + segment.text.length, 0)} 字
                  </p>
                </div>
              </div>
            </div>
            <div className="review-transcript">
              {lecture.segments.map((segment) => (
                <div className="review-segment" key={segment.id}>
                  <span>{formatClock(segment.at)}</span>
                  <p>{segment.text}</p>
                </div>
              ))}
              {!lecture.segments.length && (
                <div className="review-no-transcript">这堂课没有留下转写内容。</div>
              )}
            </div>
          </section>
        </main>

        <aside className="review-side">
          <ChatPanel
            messages={messages}
            onSend={(text) => void handleAsk(text)}
            streaming={streaming}
            streamingText={streamingText}
            onStop={() => chatAbortRef.current?.abort()}
            suggestions={noteQuestions}
            modeLabel={
              llmConfigured ? (chatSource === "ai" ? "AI 已连接" : "本地检索") : "本地检索"
            }
            emptyTitle="这堂课，还有哪里没懂？"
            emptyText="我会结合完整转写和课堂纪要回答，适合复习时继续追问。"
            startAtTop
          />

          <div className="review-side-card">
            <span className="review-side-label">课堂归档</span>
            <div>
              <span>课程</span>
              <Link to={`/space/${lecture.courseId}`}>
                {lecture.courseName} <ArrowUpRight size={12} />
              </Link>
            </div>
            <div>
              <span>老师</span>
              <strong>{lecture.teacher}</strong>
            </div>
            <div>
              <span>开始时间</span>
              <strong>{formatDateTime(lecture.startedAt)}</strong>
            </div>
            <div>
              <span>结束时间</span>
              <strong>{formatDateTime(lecture.endedAt)}</strong>
            </div>
            <div>
              <span>转写来源</span>
              <strong>{lecture.segments.length ? "浏览器实时识别" : "无"}</strong>
            </div>
          </div>

          <button
            className="review-teacher-link"
            onClick={() => navigate(`/space/${lecture.courseId}#teacher-profile`)}
          >
            <span>
              <GraduationCap size={17} />
            </span>
            <div>
              <strong>查看老师画像</strong>
              <small>讲课风格与下一次听课建议</small>
            </div>
            <ArrowUpRight size={15} />
          </button>

          <button className="review-new-class" onClick={() => navigate("/")}>
            <span className="review-new-icon">
              <Play size={15} fill="currentColor" />
            </span>
            <div>
              <strong>开始下一堂课</strong>
              <span>让新的内容继续生长</span>
            </div>
            <ArrowUpRight size={16} />
          </button>
        </aside>
      </div>

      <Modal
        open={deleteOpen}
        onClose={deleting ? () => {} : () => setDeleteOpen(false)}
        className="confirm-modal"
        labelledBy="delete-lecture-title"
      >
        <div className="confirm-icon danger">
          <Trash2 size={22} />
        </div>
        <h2 id="delete-lecture-title">删除这堂课？</h2>
        <p>
          「{lecture.title}」的转写、纪要、问答和录音都会一起删除，且无法恢复。
        </p>
        <div className="modal-actions">
          <button className="button ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
            保留记录
          </button>
          <button className="button danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}
            确认删除
          </button>
        </div>
      </Modal>

      <DiagramModal
        open={Boolean(diagramTarget)}
        target={diagramTarget}
        lectureId={lectureId}
        onClose={() => setDiagramTarget(null)}
      />
    </div>
  );
}
