import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  LoaderCircle,
  Network,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Modal } from "./Modal";
import { LogicDiagram } from "./LogicDiagram";
import { api, errorMessage } from "../lib/api";
import type { NoteDiagram } from "../types";

export interface DiagramTarget {
  scope: "overall" | "section";
  sectionId?: string;
  label?: string;
}

interface DiagramModalProps {
  open: boolean;
  onClose: () => void;
  lectureId: string;
  target: DiagramTarget | null;
}

const sourceLabels: Record<"ai" | "local", string> = {
  ai: "AI 梳理",
  local: "本地整理",
};

function downloadSvg(svg: SVGSVGElement | null, filename: string) {
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const source = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replace(/[\\/:*?"<>|]/g, "-");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DiagramModal({
  open,
  onClose,
  lectureId,
  target,
}: DiagramModalProps) {
  const [diagram, setDiagram] = useState<NoteDiagram | null>(null);
  const [source, setSource] = useState<"ai" | "local">("local");
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const svgRef = useRef<SVGSVGElement | null>(null);

  const scope = target?.scope || "overall";
  const sectionId = target?.sectionId;

  const load = useCallback(
    async (refresh: boolean) => {
      if (!lectureId) return;
      setLoading(true);
      setError("");
      try {
        const result = await api.diagram(lectureId, {
          scope,
          sectionId,
          refresh,
        });
        setDiagram(result.diagram);
        setSource(result.source);
        setWarning(result.warning || "");
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [lectureId, scope, sectionId],
  );

  useEffect(() => {
    if (!open) return;
    setDiagram(null);
    setWarning("");
    setError("");
    void load(false);
  }, [open, load]);

  const handleDownload = () => {
    if (!diagram) return;
    downloadSvg(svgRef.current, `${diagram.title || "课堂逻辑示意图"}.svg`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="diagram-modal"
      labelledBy="logic-diagram-title"
    >
      <header className="diagram-modal-head">
        <span className="modal-eyebrow">
          <Network size={13} /> LOGIC MAP
        </span>
        <h2 id="logic-diagram-title">逻辑示意图</h2>
        <p>
          {target?.label
            ? target.scope === "overall"
              ? "整堂课的讲解脉络"
              : `「${target.label}」的讲解脉络`
            : "把这段摘要展开成一张可读的逻辑图"}
        </p>
      </header>

      <div className="diagram-modal-body">
        {!diagram && loading && (
          <div className="diagram-loading" role="status">
            <div className="diagram-loading-visual">
              <span className="diagram-loading-ring" />
              <Network size={22} />
            </div>
            <strong>正在梳理这段内容的逻辑…</strong>
            <p>会把概念、例子和结论整理成分支与箭头。</p>
          </div>
        )}

        {!diagram && !loading && error && (
          <div className="diagram-error">
            <TriangleAlert size={22} />
            <strong>示意图没有生成成功</strong>
            <p>{error}</p>
            <button className="button primary small" onClick={() => void load(false)}>
              再试一次
            </button>
          </div>
        )}

        {diagram && (
          <div className={`diagram-canvas ${loading ? "is-refreshing" : ""}`}>
            <LogicDiagram diagram={diagram} svgRef={svgRef} />
            {loading && (
              <span className="diagram-refresh-veil">
                <LoaderCircle size={15} className="spin" /> 正在重新梳理…
              </span>
            )}
          </div>
        )}
      </div>

      <footer className="diagram-modal-foot">
        <div className="diagram-source">
          <span className={`source-pill source-${source}`}>
            {sourceLabels[source]}
          </span>
          {warning ? <span className="diagram-warning">{warning}</span> : null}
          {!warning && diagram ? (
            <span className="diagram-hint">文字来自本段摘要，箭头表示讲述顺序</span>
          ) : null}
        </div>
        <div className="diagram-actions">
          <button
            className="button ghost small"
            onClick={() => void load(true)}
            disabled={loading}
          >
            {loading ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            重新生成
          </button>
          <button
            className="button ghost small"
            onClick={handleDownload}
            disabled={!diagram || loading}
          >
            <Download size={14} /> 下载 SVG
          </button>
          <button className="button primary small" onClick={onClose}>
            关闭
          </button>
        </div>
      </footer>
    </Modal>
  );
}
