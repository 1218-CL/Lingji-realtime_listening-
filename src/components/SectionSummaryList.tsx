import { Network } from "lucide-react";
import type { NoteSection } from "../types";
import { formatClock } from "../lib/format";

interface SectionSummaryListProps {
  sections: NoteSection[];
  onDiagram: (section: NoteSection) => void;
  emptyHint?: string;
}

function sectionRange(section: NoteSection): string {
  if (!section.endSec) return "早前生成的摘要";
  const end = Math.max(section.startSec, section.endSec);
  return `${formatClock(section.startSec)}–${formatClock(end)}`;
}

export function SectionSummaryList({
  sections,
  onDiagram,
  emptyHint,
}: SectionSummaryListProps) {
  if (!sections.length) {
    return emptyHint ? <p className="section-summary-empty">{emptyHint}</p> : null;
  }

  return (
    <div className="section-summary-list">
      {sections.map((section) => (
        <article className="section-summary-card" key={section.id}>
          <header className="section-summary-head">
            <span className="section-summary-index">
              {String(section.index || 1).padStart(2, "0")}
            </span>
            <div className="section-summary-title">
              <strong>{section.title || `第 ${section.index} 段`}</strong>
              <em>
                {sectionRange(section)}
                {section.chars > 0 ? ` · ${section.chars.toLocaleString("zh-CN")} 字` : ""}
              </em>
            </div>
            <button
              className="diagram-trigger"
              onClick={() => onDiagram(section)}
              title="把这一段整理成逻辑示意图"
            >
              <Network size={13} /> 示意图
            </button>
          </header>

          <p className="section-summary-text">{section.summary}</p>

          {section.points?.length > 0 && (
            <ul className="section-summary-points">
              {section.points.map((point) => (
                <li key={`${section.id}-${point.slice(0, 10)}`}>{point}</li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}
