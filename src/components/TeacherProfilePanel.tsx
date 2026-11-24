import type { ReactNode } from "react";
import {
  AlertCircle,
  BookOpenCheck,
  Check,
  GraduationCap,
  Headphones,
  Lightbulb,
  LoaderCircle,
  NotebookPen,
  Quote,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { CourseSummary, TeacherProfile } from "../types";
import { formatReadableDuration, formatRelative } from "../lib/format";

interface TeacherProfilePanelProps {
  course: CourseSummary;
  profile: TeacherProfile | null;
  lectureCount: number;
  segmentCount: number;
  generating: boolean;
  onGenerate: () => void;
}

const sourceLabels: Record<string, string> = {
  ai: "AI 分析",
  local: "本地分析",
  demo: "示例画像",
};

const confidenceLabels: Record<string, string> = {
  low: "样本较少",
  medium: "样本适中",
  high: "样本充足",
};

export function TeacherProfilePanel({
  course,
  profile,
  lectureCount,
  segmentCount,
  generating,
  onGenerate,
}: TeacherProfilePanelProps) {
  const stale = Boolean(
    profile &&
      (profile.lectureCount !== lectureCount ||
        (typeof profile.segmentCount === "number" &&
          profile.segmentCount !== segmentCount) ||
        profile.teacher !== course.teacher),
  );
  const canGenerate = lectureCount > 0 && !generating;

  return (
    <section className="teacher-profile panel" id="teacher-profile">
      <div className="teacher-profile-top">
        <div className="teacher-identity">
          <div className="teacher-portrait-wrap" aria-hidden="true">
            <span className="teacher-portrait-orbit" />
            <span className="teacher-portrait">
              <GraduationCap size={25} />
            </span>
          </div>
          <div className="teacher-profile-heading">
            <span className="section-kicker">TEACHER INSIGHT</span>
            <h2>{course.teacher}老师的课堂画像</h2>
            <p>
              {profile
                ? profile.summary
                : `根据这门课已有的 ${lectureCount} 堂课，提炼可观察的讲解方式，并转化为真正可执行的听课策略。`}
            </p>
          </div>
        </div>
        <div className="teacher-profile-actions">
          {profile && (
            <div className="teacher-profile-meta">
              <span className={`profile-source source-${profile.source}`}>
                {sourceLabels[profile.source] || "课堂分析"}
              </span>
              <span>{formatRelative(profile.updatedAt)}更新</span>
            </div>
          )}
          <button
            className={`button small ${profile ? "ghost" : "primary"}`}
            onClick={onGenerate}
            disabled={!canGenerate}
          >
            {generating ? (
              <LoaderCircle size={15} className="spin" />
            ) : profile ? (
              <RefreshCw size={15} />
            ) : (
              <Sparkles size={15} />
            )}
            {generating ? "正在画像…" : profile ? (stale ? "更新画像" : "重新生成") : "生成老师画像"}
          </button>
        </div>
      </div>

      {!profile && generating && (
        <div className="teacher-profile-loading" aria-live="polite">
          <div className="teacher-loading-head">
            <Sparkles size={15} />
            正在阅读课堂转写，提炼讲课特征与听课策略…
          </div>
          <div className="teacher-loading-grid">
            {[0, 1, 2, 3, 4].map((item) => (
              <div className="teacher-loading-card" key={item}>
                <div className="skeleton-line w-40" />
                <div className="skeleton-line w-90" />
                <div className="skeleton-line w-70" />
              </div>
            ))}
          </div>
        </div>
      )}

      {!profile && !generating && (
        <div className="teacher-profile-empty">
          <div className="teacher-empty-preview">
            <div>
              <span className="teacher-preview-icon">
                <Lightbulb size={17} />
              </span>
              <strong>风格标签</strong>
              <p>结构、节奏、举例、互动、重点呈现</p>
            </div>
            <div>
              <span className="teacher-preview-icon">
                <BookOpenCheck size={17} />
              </span>
              <strong>听课策略</strong>
              <p>课前准备、课中记录、课后复习</p>
            </div>
            <div>
              <span className="teacher-preview-icon">
                <NotebookPen size={17} />
              </span>
              <strong>专属笔记法</strong>
              <p>根据老师讲解方式生成三栏笔记建议</p>
            </div>
          </div>
          <div className="teacher-empty-foot">
            <span>
              <Check size={13} /> 仅分析讲课表达，不评价老师本人
            </span>
            <span>需要至少一堂有转写内容的课堂</span>
          </div>
        </div>
      )}

      {profile && (
        <div className={`teacher-profile-body ${generating ? "is-refreshing" : ""}`}>
          <div className="teacher-tag-line">
            <div className="teacher-tags">
              {profile.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="teacher-sample-meta">
              <span>{profile.lectureCount} 堂课</span>
              <span>{profile.transcriptChars} 字</span>
              <span>{formatReadableDuration(profile.durationSeconds)}</span>
              <em className={`confidence-${profile.confidence}`}>
                {confidenceLabels[profile.confidence]}
              </em>
            </div>
          </div>

          {stale && (
            <div className="teacher-stale-note">
              <RefreshCw size={13} />
              课堂记录有变化，画像尚未包含最新内容，建议更新一次。
            </div>
          )}

          <div className="teacher-dimensions">
            {profile.dimensions.map((dimension, index) => (
              <div className="teacher-dimension" key={dimension.key}>
                <span className="dimension-index">{String(index + 1).padStart(2, "0")}</span>
                <strong>{dimension.label}</strong>
                <p>{dimension.summary}</p>
              </div>
            ))}
          </div>

          <div className="teacher-advice-section">
            <div className="teacher-section-head">
              <div>
                <span className="section-kicker">LISTENING PLAYBOOK</span>
                <h3>下一次，这样听</h3>
              </div>
              <span className="teacher-advice-badge">
                <Headphones size={13} /> 专属听课建议
              </span>
            </div>
            <div className="teacher-advice-grid">
              <AdviceColumn
                icon={<BookOpenCheck size={17} />}
                label="课前"
                subtitle="带着问题进入课堂"
                items={profile.advice.before}
                tone="blue"
              />
              <AdviceColumn
                icon={<Headphones size={17} />}
                label="课中"
                subtitle="把注意力放在正确的位置"
                items={profile.advice.during}
                tone="teal"
              />
              <AdviceColumn
                icon={<NotebookPen size={17} />}
                label="课后"
                subtitle="把听懂变成真正记住"
                items={profile.advice.after}
                tone="warm"
              />
            </div>
          </div>

          <div className="teacher-insight-grid">
            <div className="teacher-note-strategy">
              <span className="teacher-insight-icon">
                <NotebookPen size={17} />
              </span>
              <div>
                <span>推荐笔记法</span>
                <p>{profile.noteStrategy}</p>
              </div>
            </div>
            <div className="teacher-watchouts">
              <span className="teacher-insight-icon warm">
                <AlertCircle size={17} />
              </span>
              <div>
                <span>听课时留意</span>
                <ul>
                  {profile.attentionPoints.slice(0, 3).map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="teacher-strengths">
            <span>课堂优势</span>
            <div>
              {profile.strengths.slice(0, 3).map((strength) => (
                <p key={strength}>
                  <Check size={13} /> {strength}
                </p>
              ))}
            </div>
          </div>

          {profile.evidence.length > 0 && (
            <details className="teacher-evidence">
              <summary>
                <Quote size={14} /> 查看画像依据的课堂片段
              </summary>
              <div>
                {profile.evidence.map((quote) => (
                  <blockquote key={quote}>{quote}</blockquote>
                ))}
              </div>
            </details>
          )}

          <div className="teacher-profile-foot">
            <span>
              基于课堂文字转写生成 · {sourceLabels[profile.source] || "课堂分析"}
            </span>
            <span>
              {stale ? "有新课堂尚未纳入" : "画像只描述可观察的讲课方式"}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function AdviceColumn({
  icon,
  label,
  subtitle,
  items,
  tone,
}: {
  icon: ReactNode;
  label: string;
  subtitle: string;
  items: string[];
  tone: "blue" | "teal" | "warm";
}) {
  return (
    <div className={`teacher-advice-card tone-${tone}`}>
      <div className="advice-card-head">
        <span>{icon}</span>
        <div>
          <strong>{label}</strong>
          <em>{subtitle}</em>
        </div>
      </div>
      <ul>
        {items.slice(0, 4).map((item) => (
          <li key={item}>
            <span />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
