import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Cloud,
  CloudOff,
  LoaderCircle,
  Mic2,
  Radio,
  RotateCcw,
  Square,
  Sparkles,
  WifiOff,
} from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { useRecorder } from "../hooks/useRecorder";
import {
  useServerTranscription,
  type ServerTranscriptionState,
} from "../hooks/useServerTranscription";
import type {
  AsrSettings,
  ChatMessage,
  LectureDetail,
  LectureNote,
  SummaryState,
  TranscriptSegment,
} from "../types";
import { formatClock } from "../lib/format";
import { Modal } from "../components/Modal";
import { NotePanel } from "../components/NotePanel";
import { ChatPanel } from "../components/ChatPanel";
import { DiagramModal, type DiagramTarget } from "../components/DiagramModal";
import { ImageAttachments } from "../components/ImageAttachments";
import { TranscriptDrawer } from "../components/TranscriptDrawer";
import { Waveform } from "../components/Waveform";
import { Logo } from "../components/Logo";

type SaveState = "saved" | "saving" | "error";

export function RecordingPage() {
  const { lectureId = "" } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [lecture, setLecture] = useState<LectureDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [note, setNote] = useState<LectureNote | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [summaryState, setSummaryState] = useState<SummaryState>({
    cursor: 0,
    pendingChars: 0,
    pendingImages: false,
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [chatSource, setChatSource] = useState<"ai" | "local">("local");
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [asrSettings, setAsrSettings] = useState<AsrSettings | null>(null);
  const [settingsReady, setSettingsReady] = useState(false);
  const [asrState, setAsrState] = useState<ServerTranscriptionState>("idle");
  const [asrError, setAsrError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [elapsedOffset, setElapsedOffset] = useState(0);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishStage, setFinishStage] = useState("正在保存录音与转写…");
  const [autoStartBlocked, setAutoStartBlocked] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [lastSegmentAt, setLastSegmentAt] = useState(0);
  const [diagramTarget, setDiagramTarget] = useState<DiagramTarget | null>(null);

  const segmentsRef = useRef<TranscriptSegment[]>([]);
  const autoStartedRef = useRef(false);
  const noteRef = useRef<LectureNote | null>(null);
  const analyzingRef = useRef(false);
  const warnedFallbackRef = useRef(false);
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  const finishingRef = useRef(false);
  const elapsedOffsetRef = useRef(0);
  const elapsedSecRef = useRef(0);

  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  const handleFinal = useCallback((text: string, at: number) => {
    const clean = text.trim();
    if (!clean) return;
    const segment: TranscriptSegment = {
      id: crypto.randomUUID(),
      text: clean,
      at: Math.max(0, Math.round(at + elapsedOffsetRef.current)),
    };
    segmentsRef.current = [...segmentsRef.current, segment];
    setSegments(segmentsRef.current);
    setLastSegmentAt(Date.now());
  }, []);

  const asrEnabled = Boolean(
    asrSettings?.enabled && asrSettings?.configured,
  );
  const asrErrorNotifiedRef = useRef(false);

  const recorder = useRecorder({
    language: "zh-CN",
    onFinal: handleFinal,
    onError: (message) => showToast(message, "error"),
    browserSpeechEnabled: !asrEnabled,
  });

  const {
    status: recorderStatus,
    interim,
    error: recorderError,
    elapsedSec,
    analyser,
    start,
    stop,
  } = recorder;

  const handleServerFinal = useCallback(
    (text: string, at: number) => {
      setAsrError("");
      asrErrorNotifiedRef.current = false;
      handleFinal(text, at);
    },
    [handleFinal],
  );

  const serverAsr = useServerTranscription({
    enabled: asrEnabled,
    stream: recorder.stream,
    lectureId,
    getAt: () => elapsedOffsetRef.current + elapsedSecRef.current,
    onFinal: handleServerFinal,
    onState: setAsrState,
    onError: (message) => {
      setAsrError(message);
      if (!asrErrorNotifiedRef.current) {
        asrErrorNotifiedRef.current = true;
        showToast(message, "error");
      }
    },
  });

  const totalElapsed = elapsedOffset + elapsedSec;
  const transcriptAge = lastSegmentAt ? Date.now() - lastSegmentAt : Number.POSITIVE_INFINITY;
  const transcriptStatusLabel = asrEnabled
    ? asrState === "transcribing"
      ? "服务端识别中"
      : asrState === "error"
        ? "服务端识别失败"
        : transcriptAge < 30_000
          ? "刚刚更新"
          : segments.length
            ? "等待新内容"
            : "准备识别"
    : recorderError
      ? "识别中断，后台重连"
      : interim
        ? "正在识别这一句"
        : transcriptAge < 30_000
          ? "刚刚更新"
          : segments.length
            ? "等待新内容"
            : "准备识别";
  useEffect(() => {
    elapsedSecRef.current = elapsedSec;
  }, [elapsedSec]);
  useEffect(() => {
    elapsedOffsetRef.current = elapsedOffset;
  }, [elapsedOffset]);

  // Load the lecture once, then auto-start capture (the user already tapped the mic).
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .lecture(lectureId)
      .then(({ lecture: value }) => {
        if (!alive) return;
        if (value.status === "completed") {
          navigate(`/lecture/${lectureId}`, { replace: true });
          return;
        }
        setLecture(value);
        setSegments(value.segments);
        segmentsRef.current = value.segments;
        setNote(value.note);
        noteRef.current = value.note;
        setSummaryState(value.summaryState);
        setMessages(value.chat);
        let persisted = 0;
        try {
          persisted = Number(
            localStorage.getItem(`lingji-recording-elapsed-${value.id}`) || 0,
          );
        } catch {
          // Storage can be unavailable in strict privacy modes.
        }
        // Refresh should resume the class timer instead of restarting at 00:00.
        const restored = Math.max(
          0,
          Number.isFinite(persisted) ? persisted : 0,
          value.durationSec || 0,
        );
        elapsedOffsetRef.current = restored;
        setElapsedOffset(restored);
        document.title = `${value.title} · 聆记`;
      })
      .catch((err) => setLoadError(errorMessage(err)))
      .finally(() => {
        if (alive) setLoading(false);
      });
    api
      .settings()
      .then((result) => {
        const configured = result.llm.configured;
        setLlmConfigured(configured);
        setAsrSettings(result.asr);
        setChatSource(configured ? "ai" : "local");
      })
      .catch(() => {})
      .finally(() => setSettingsReady(true));
    return () => {
      alive = false;
    };
  }, [lectureId, navigate]);

  useEffect(() => {
    if (!lecture || !settingsReady || autoStartedRef.current) return;
    autoStartedRef.current = true;
    const timer = window.setTimeout(async () => {
      const started = await start();
      if (!started) setAutoStartBlocked(true);
    }, 520);
    return () => window.clearTimeout(timer);
  }, [lecture, settingsReady, start]);

  // Keep the elapsed class time across refreshes (localStorage for precision,
  // and a periodic server save as fallback for another browser/device).
  useEffect(() => {
    if (!lecture || recorderStatus !== "recording") return;
    const key = `lingji-recording-elapsed-${lecture.id}`;
    const localTimer = window.setInterval(() => {
      try {
        localStorage.setItem(
          key,
          String(elapsedOffsetRef.current + elapsedSecRef.current),
        );
      } catch {
        // ignore
      }
    }, 1_000);
    return () => window.clearInterval(localTimer);
  }, [lecture, recorderStatus]);

  useEffect(() => {
    if (!lecture || recorderStatus !== "recording") return;
    const serverTimer = window.setInterval(() => {
      const value = elapsedOffsetRef.current + elapsedSecRef.current;
      if (value > 0) {
        void api
          .updateLecture(lecture.id, { durationSec: value })
          .catch(() => {});
      }
    }, 15_000);
    return () => window.clearInterval(serverTimer);
  }, [lecture, recorderStatus]);

  const syncNow = useCallback(async () => {
    const snapshot = segmentsRef.current;
    if (!snapshot.length) return;
    if (syncPromiseRef.current) {
      await syncPromiseRef.current.catch(() => {});
    }
    setSaveState("saving");
    const task = api
      .syncTranscript(lectureId, snapshot)
      .then(() => setSaveState("saved"))
      .catch((err) => {
        setSaveState("error");
        throw err;
      })
      .finally(() => {
        if (syncPromiseRef.current === task) syncPromiseRef.current = null;
      });
    syncPromiseRef.current = task;
    await task.catch(() => {});
  }, [lectureId]);

  useEffect(() => {
    if (!segments.length) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      void syncNow();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [segments, syncNow]);

  const updateSummary = useCallback(async () => {
    if (analyzingRef.current) return;
    const content = segmentsRef.current.map((segment) => segment.text).join("");
    const pending = Math.max(0, content.length - summaryState.cursor);
    if (pending < 20 && !summaryState.pendingImages) return;
    analyzingRef.current = true;
    setAnalyzing(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 75_000);
    try {
      await syncNow();
      const result = await api.notes(
        lectureId,
        content,
        controller.signal,
        false,
      );
      setNote(result.note);
      noteRef.current = result.note;
      setSummaryState(result.lecture.summaryState);
      setChatSource((current) =>
        result.source === "ai" ? "ai" : current === "ai" ? "local" : current,
      );
      if (result.warning && !warnedFallbackRef.current) {
        warnedFallbackRef.current = true;
        showToast(result.warning, "info");
      }
    } catch (err) {
      if (!controller.signal.aborted) showToast(errorMessage(err), "error");
    } finally {
      window.clearTimeout(timer);
      analyzingRef.current = false;
      setAnalyzing(false);
    }
  }, [lectureId, showToast, summaryState.cursor, summaryState.pendingImages, syncNow]);

  const transcriptText = useMemo(
    () => segments.map((segment) => segment.text).join(""),
    [segments],
  );
  const pendingChars = Math.max(0, transcriptText.length - summaryState.cursor);
  const canUpdateSummary =
    !analyzing && (pendingChars >= 20 || summaryState.pendingImages);

  const handleAsk = useCallback(
    async (question: string) => {
      if (streamingRef.current) return;
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
      await syncNow();
      const controller = new AbortController();
      chatAbortRef.current = controller;
      let accumulated = "";
      try {
        await api.chatStream(
          lectureId,
          clean,
          segmentsRef.current.map((segment) => segment.text).join(""),
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
              const content = payload.content || accumulated;
              setChatSource(payload.source);
              setMessages((current) => [
                ...current,
                {
                  id: payload.messageId,
                  role: "assistant",
                  content,
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
    },
    [lectureId, showToast, syncNow],
  );

  const stopChat = useCallback(() => {
    chatAbortRef.current?.abort();
  }, []);

  const handleFinish = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishOpen(false);
    setFinishing(true);
    setFinishStage("正在保存录音与转写…");
    try {
      if (asrEnabled) {
        setFinishStage("正在完成最后一段转写…");
        await serverAsr.stop();
        await serverAsr.flush();
      }
      const result = await stop();
      const duration = Math.max(totalElapsed, result.durationSec || 0);
      await syncNow();
      let uploadTask: Promise<void> = Promise.resolve();
      if (result.blob && result.blob.size > 512) {
        setFinishStage("正在保存课堂录音…");
        uploadTask = api
          .uploadAudio(lectureId, result.blob, result.mime)
          .then(() => {})
          .catch(() => {
            showToast("录音上传失败，但转写已经保存。", "error");
          });
      }
      setFinishStage("正在归档这堂课…");
      await api.updateLecture(lectureId, {
        status: "completed",
        durationSec: duration,
      });
      await uploadTask;
      try {
        localStorage.removeItem(`lingji-recording-elapsed-${lectureId}`);
      } catch {
        // ignore
      }
      navigate(`/lecture/${lectureId}`, { replace: true });
    } catch (err) {
      showToast(errorMessage(err), "error");
      finishingRef.current = false;
      setFinishing(false);
    }
  };

  const handleBack = () => {
    if (recorderStatus === "recording") {
      const leave = window.confirm(
        "离开后本轮录音会停止，但这堂课会保留，可以从首页继续。确定离开吗？",
      );
      if (!leave) return;
    }
    navigate("/");
  };

  const retryMicrophone = async () => {
    setAutoStartBlocked(false);
    recorder.clearError();
    const started = await start();
    if (!started) setAutoStartBlocked(true);
  };

  if (loading) {
    return (
      <div className="record-loading">
        <Logo />
        <div className="loading-orb">
          <span />
          <Mic2 size={26} />
        </div>
        <p>正在准备你的课堂…</p>
      </div>
    );
  }

  if (loadError || !lecture) {
    return (
      <div className="record-loading">
        <div className="fatal-icon">
          <WifiOff size={24} />
        </div>
        <h2>无法打开这堂课</h2>
        <p>{loadError || "课堂记录不存在。"}</p>
        <button className="button primary" onClick={() => navigate("/")}>
          回到首页
        </button>
      </div>
    );
  }

  const isLive = recorderStatus === "recording";
  const statusCopy: Record<string, string> = {
    idle: "准备中",
    requesting: "连接麦克风",
    recording: "录音中",
    stopping: "正在停止",
    error: "需要麦克风",
  };

  return (
    <div className="record-page">
      <header className="record-header">
        <div className="record-header-left">
          <button className="back-circle" onClick={handleBack} aria-label="返回首页">
            <ArrowLeft size={18} />
          </button>
          <span className="record-course-mark" style={{ background: lecture.course?.color }}>
            {lecture.course?.name.slice(0, 1) || "课"}
          </span>
          <div className="record-title">
            <span>{lecture.course?.name}</span>
            <strong>{lecture.title}</strong>
          </div>
        </div>

        <div className={`record-live ${isLive ? "is-live" : ""}`}>
          <span className={`recording-badge ${recorderStatus}`}>
            {recorderStatus === "requesting" || recorderStatus === "stopping" ? (
              <LoaderCircle size={13} className="spin" />
            ) : recorderStatus === "error" ? (
              <Mic2 size={13} />
            ) : (
              <span className="record-dot" />
            )}
            {statusCopy[recorderStatus] || "准备中"}
          </span>
          <strong className="record-timer">{formatClock(totalElapsed)}</strong>
          <div className="record-mini-wave">
            <Waveform
              analyser={analyser}
              active={isLive}
              color="#027789"
              height={24}
              bars={18}
            />
          </div>
        </div>

        <div className="record-header-actions">
          <button
            className={`transcript-peek ${
              asrEnabled ? (asrError ? "has-error" : "") : recorderError ? "has-error" : ""
            }`}
            onClick={() => setTranscriptOpen(true)}
            title="查看后台转写"
          >
            <Radio size={14} />
            <span>转写</span>
            <em>
              {transcriptStatusLabel}
              {segments.length > 0 ? ` · ${segments.length} 段` : ""}
            </em>
          </button>
          <span className={`save-state save-${saveState}`}>
            {saveState === "saving" ? (
              <LoaderCircle size={13} className="spin" />
            ) : saveState === "error" ? (
              <CloudOff size={14} />
            ) : (
              <Cloud size={14} />
            )}
            {saveState === "saving" ? "保存中" : saveState === "error" ? "待重试" : "已保存"}
          </span>
          <button className="end-class" onClick={() => setFinishOpen(true)} disabled={finishing}>
            <Square size={13} fill="currentColor" /> 结束课堂
          </button>
        </div>
      </header>

      {recorderStatus === "error" && autoStartBlocked && (
        <div className="recording-alert">
          <div>
            <Mic2 size={17} />
            <span>{recorderError || "麦克风还没有连接成功。"}</span>
          </div>
          <button onClick={retryMicrophone}>
            <RotateCcw size={14} /> 重新连接
          </button>
        </div>
      )}

      {!asrEnabled && !recorder.speechSupported && (
        <div className="recording-alert">
          <div>
            <WifiOff size={17} />
            <span>
              当前浏览器不支持后台语音识别，录音和随堂问答仍可用；可在设置中接入服务端转写。
            </span>
          </div>
        </div>
      )}

      <div className="record-focus-grid">
        <NotePanel
          note={note}
          analyzing={analyzing}
          onRefresh={() => void updateSummary()}
          onAsk={(question) => void handleAsk(question)}
          onDiagram={(scope, sectionId) =>
            setDiagramTarget({
              scope,
              sectionId,
              label:
                scope === "section"
                  ? note?.sections?.find((section) => section.id === sectionId)?.title
                  : "整堂课",
            })
          }
          disabled={!canUpdateSummary}
          pendingChars={pendingChars}
          pendingImages={summaryState.pendingImages}
          imageSlot={
            <ImageAttachments
              lectureId={lectureId}
              images={lecture?.images || []}
              onChange={(images) =>
                setLecture((current) =>
                  current
                    ? { ...current, images, imageCount: images.length }
                    : current,
                )
              }
              onUploaded={() =>
                setSummaryState((current) => ({
                  ...current,
                  pendingImages: true,
                }))
              }
            />
          }
        />
        <ChatPanel
          messages={messages}
          onSend={(text) => void handleAsk(text)}
          streaming={streaming}
          streamingText={streamingText}
          onStop={stopChat}
          suggestions={note?.questions || []}
          modeLabel={
            llmConfigured ? (chatSource === "ai" ? "AI 实时" : "本地检索") : "本地检索"
          }
          emptyTitle="边听边问，不用等下课"
          emptyText="我会结合正在生成的课堂纪要和后台转写回答，不会打断录音。"
        />
      </div>

      <TranscriptDrawer
        open={transcriptOpen}
        onClose={() => setTranscriptOpen(false)}
        segments={segments}
        interim={interim}
        statusLabel={transcriptStatusLabel}
        sourceLabel={asrEnabled ? "服务端识别" : "浏览器识别"}
        error={asrEnabled ? asrError : recorderError}
      />

      <Modal
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        className="finish-modal"
        labelledBy="finish-title"
      >
        <div className="finish-modal-icon">
          <span className="finish-pulse" />
          <Check size={23} />
        </div>
        <h2 id="finish-title">要结束这堂课了吗？</h2>
        <p>结束后不会自动生成摘要。转写、图片和录音会先归档，你可以回顾页再点「更新摘要」。</p>
        <div className="finish-stats">
          <div>
            <span>录音时长</span>
            <strong>{formatClock(totalElapsed)}</strong>
          </div>
          <div>
            <span>转写字数</span>
            <strong>{transcriptText.length}</strong>
          </div>
          <div>
            <span>未摘要</span>
            <strong>{pendingChars > 0 ? `${pendingChars} 字` : "已是最新"}</strong>
          </div>
        </div>
        <div className="modal-actions">
          <button className="button ghost" onClick={() => setFinishOpen(false)}>
            继续听课
          </button>
          <button className="button primary" onClick={() => void handleFinish()}>
            <Check size={17} /> 结束并保存
          </button>
        </div>
      </Modal>

      {finishing && (
        <div className="finishing-overlay" role="status" aria-live="polite">
          <div className="finishing-card">
            <div className="finishing-visual">
              <span className="finish-orbit orbit-a" />
              <span className="finish-orbit orbit-b" />
              <span className="finish-orb-core">
                <Sparkles size={26} />
              </span>
            </div>
            <span className="finishing-eyebrow">WRAPPING UP</span>
            <h2>正在合上这堂课</h2>
            <p>{finishStage}</p>
            <div className="finish-progress">
              <span />
            </div>
            <small>请不要关闭页面</small>
          </div>
        </div>
      )}

      <DiagramModal
        open={Boolean(diagramTarget)}
        target={diagramTarget}
        lectureId={lectureId}
        onClose={() => setDiagramTarget(null)}
      />
    </div>
  );
}
