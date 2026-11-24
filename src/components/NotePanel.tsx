import type { ReactNode } from "react";
import {
  ArrowUpRight,
  AudioLines,
  LoaderCircle,
  Network,
  Quote,
  Sparkles,
} from "lucide-react";
import type { LectureNote } from "../types";
import { formatRelative } from "../lib/format";
import { SectionSummaryList } from "./SectionSummaryList";

interface NotePanelProps {
  note: LectureNote | null;
  analyzing: boolean;
  onRefresh: () => void;
  onAsk?: (question: string) => void;
  onDiagram?: (scope: "overall" | "section", sectionId?: string) => void;
  disabled?: boolean;
  imageSlot?: ReactNode;
  pendingChars?: number;
  pendingImages?: boolean;
}

const sourceLabels: Record<string, string> = {
  ai: "AI 分析",
  local: "本地分析",
  demo: "示例纪要",
};

export function NotePanel({
  note,
  analyzing,
  onRefresh,
  onAsk,
  onDiagram,
  disabled,
  imageSlot,
  pendingChars = 0,
  pendingImages = false,
}: NotePanelProps) {
  const hasContent = Boolean(note?.summary || note?.keyPoints?.length);
  const sections = (note?.sections || []).slice().reverse();

  return (
    <section className="panel note-panel" aria-label="课堂纪要">
      <div className="panel-head note-head">
        <div className="panel-title">
          <span className="icon-badge icon-badge-teal">
            <Sparkles size={17} />
          </span>
          <div>
            <h2>课堂纪要</h2>
            <p>
              {analyzing ? (
                <span className="analyzing-label">
                  <LoaderCircle size={12} className="spin" /> 正在整理新增内容…
                </span>
              ) : (
                <span className="manual-label">
                  手动更新
                  {note?.updatedAt ? ` · 上次更新 ${formatRelative(note.updatedAt)}` : ""}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="note-head-actions">
          {(pendingChars > 0 || pendingImages) && (
            <span className="note-pending-pill">
              {pendingChars > 0 ? `+${pendingChars.toLocaleString("zh-CN")} 字` : ""}
              {pendingChars > 0 && pendingImages ? " · " : ""}
              {pendingImages ? "新图片" : ""}
            </span>
          )}
          <button
            className="button primary small note-update-button"
            onClick={onRefresh}
            disabled={disabled || analyzing}
            title="把新增转写和图片整理进摘要"
          >
            {analyzing && <LoaderCircle size={14} className="spin" />}
            {analyzing ? "整理中" : "更新摘要"}
          </button>
        </div>
      </div>

      {imageSlot}

      {analyzing && <div className="analysis-progress" aria-hidden="true" />}

      <div className="note-body">
        {!hasContent && !analyzing && (
          <div className="note-empty">
            <div className="note-empty-orbit">
              <AudioLines size={23} />
              <span />
            </div>
            <strong>课堂正在被记录</strong>
            <p>
              转写不再占用主界面。点击右上角「更新摘要」，才会把当前内容整理成纪要。
            </p>
          </div>
        )}

        {!hasContent && analyzing && (
          <div className="note-skeleton">
            <div className="skeleton-line w-90" />
            <div className="skeleton-line w-70" />
            <div className="skeleton-line w-84" />
            <div className="skeleton-line w-56" />
            <div className="skeleton-block" />
            <div className="skeleton-line w-78" />
            <div className="skeleton-line w-64" />
          </div>
        )}

        {hasContent && note && (
          <>
            <div className="note-summary">
              <div className="note-summary-head">
                <span className="note-summary-label">
                  <Quote size={13} /> 全局摘要
                </span>
                {onDiagram && (
                  <button
                    className="diagram-trigger"
                    onClick={() => onDiagram("overall")}
                    title="把整堂课的摘要梳理成逻辑示意图"
                  >
                    <Network size={13} /> 示意图
                  </button>
                )}
              </div>
              <p>{note.summary}</p>
            </div>

            <div className="note-section">
              <div className="note-section-title">
                <span>分段摘要</span>
                <em>
                  {sections.length
                    ? `最新在前 · 共 ${sections.length} 段`
                    : "每次更新摘要会追加一段"}
                </em>
              </div>
              <SectionSummaryList
                sections={sections}
                onDiagram={(section) => onDiagram?.("section", section.id)}
                emptyHint="下一次点「更新摘要」时，这里会单独生成这一段的详细摘要。"
              />
            </div>

            {note.keyPoints?.length > 0 && (
              <div className="note-section">
                <div className="note-section-title">
                  <span>本课要点</span>
                  <em>{note.keyPoints.length} 条</em>
                </div>
                <ol className="key-points">
                  {note.keyPoints.map((point, index) => (
                    <li key={`${index}-${point.slice(0, 8)}`}>
                      <span className="point-index">{String(index + 1).padStart(2, "0")}</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {note.keywords?.length > 0 && (
              <div className="note-section">
                <div className="note-section-title">
                  <span>核心概念</span>
                </div>
                <div className="keyword-cloud">
                  {note.keywords.map((keyword) => (
                    <span className="keyword-chip" key={keyword}>
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {note.questions?.length > 0 && onAsk && (
              <div className="note-section question-section">
                <div className="note-section-title">
                  <span>值得追问</span>
                  <em>点击问 AI</em>
                </div>
                <div className="question-list">
                  {note.questions.map((question) => (
                    <button key={question} onClick={() => onAsk(question)}>
                      <span>{question}</span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="note-foot">
              <span>
                {sourceLabels[note.source] || "分析"} · {formatRelative(note.updatedAt)}更新
              </span>
              <span className="note-foot-note">内容基于本节转写与课堂图片</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
