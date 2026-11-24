import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, LoaderCircle, Radio, Search, X } from "lucide-react";
import type { TranscriptSegment } from "../types";
import { formatClock } from "../lib/format";
import { useToast } from "../context/ToastContext";

interface TranscriptDrawerProps {
  open: boolean;
  onClose: () => void;
  segments: TranscriptSegment[];
  interim?: string;
  statusLabel: string;
  sourceLabel: string;
  error?: string;
}

export function TranscriptDrawer({
  open,
  onClose,
  segments,
  interim = "",
  statusLabel,
  sourceLabel,
  error,
}: TranscriptDrawerProps) {
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [follow, setFollow] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setFollow(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return segments;
    return segments.filter((segment) => segment.text.toLowerCase().includes(keyword));
  }, [query, segments]);

  useEffect(() => {
    if (!open || !follow) return;
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [open, follow, segments.length, interim]);

  if (!open) return null;

  const copyAll = async () => {
    const content = segments.map((segment) => segment.text).join("");
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      showToast("转写已复制。", "success");
    } catch {
      showToast("复制失败，请手动选择文字。", "error");
    }
  };

  return createPortal(
    <div
      className="transcript-drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="transcript-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="课堂转写"
      >
        <header className="transcript-drawer-head">
          <div>
            <span className="transcript-drawer-eyebrow">
              <Radio size={12} /> {sourceLabel}
            </span>
            <h2>课堂转写</h2>
            <p>
              <span className={`transcript-status-dot ${error ? "error" : "live"}`} />
              {statusLabel} · {segments.length} 段
            </p>
          </div>
          <button className="transcript-drawer-close" onClick={onClose} aria-label="关闭转写">
            <X size={18} />
          </button>
        </header>

        <div className="transcript-drawer-tools">
          <label className="transcript-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索转写内容"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="清空搜索">
                <X size={13} />
              </button>
            )}
          </label>
          <button className="transcript-tool-button" onClick={() => void copyAll()}>
            <Copy size={14} /> 复制
          </button>
          <button
            className={`transcript-tool-button ${follow ? "active" : ""}`}
            onClick={() => setFollow((value) => !value)}
          >
            {follow ? "跟随最新" : "自由浏览"}
          </button>
        </div>

        {error && (
          <div className="transcript-drawer-error">
            <span>{error}</span>
          </div>
        )}

        <div
          className="transcript-drawer-list"
          ref={listRef}
          onScroll={(event) => {
            const node = event.currentTarget;
            if (node.scrollHeight - node.scrollTop - node.clientHeight > 80) {
              setFollow(false);
            }
          }}
        >
          {!filtered.length && !interim && (
            <div className="transcript-drawer-empty">
              <LoaderCircle size={20} className={error ? "" : "spin"} />
              <strong>{query ? "没有找到匹配内容" : "正在等待第一句话"}</strong>
              <p>
                {query
                  ? "换一个关键词试试。"
                  : "转写会在后台进行，你可以随时回到这里查看。"}
              </p>
            </div>
          )}
          {filtered.map((segment) => (
            <div className="transcript-drawer-segment" key={segment.id}>
              <span>{formatClock(segment.at)}</span>
              <p>{segment.text}</p>
            </div>
          ))}
          {interim && (
            <div className="transcript-drawer-segment interim">
              <span>{formatClock(segments.at(-1)?.at || 0)}</span>
              <p>
                {interim}
                <span className="interim-caret" />
              </p>
            </div>
          )}
        </div>

        <footer className="transcript-drawer-foot">
          <span>默认收起，不占主界面</span>
          <span>转写原文可能包含识别误差</span>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
