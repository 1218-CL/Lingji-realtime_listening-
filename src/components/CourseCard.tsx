import { Link } from "react-router-dom";
import { ArrowUpRight, Clock3, Mic2 } from "lucide-react";
import type { CourseSummary } from "../types";
import { formatReadableDuration, formatRelative } from "../lib/format";

interface CourseCardProps {
  course: CourseSummary;
  compact?: boolean;
}

export function CourseCard({ course, compact = false }: CourseCardProps) {
  return (
    <Link
      to={`/space/${course.id}`}
      className={`course-card ${compact ? "course-card-compact" : ""}`}
      style={{ ["--course-color" as string]: course.color }}
    >
      <div className="course-card-top">
        <span className="course-mark">{course.name.slice(0, 1)}</span>
        <span className="course-open">
          <ArrowUpRight size={17} />
        </span>
      </div>
      <div className="course-card-copy">
        <h3>{course.name}</h3>
        <p>{course.teacher} 老师</p>
      </div>
      {!compact && course.latestLecture && (
        <p className="course-latest">
          <Mic2 size={13} />
          {course.latestLecture.title}
        </p>
      )}
      {!compact && course.keywords.length > 0 && (
        <div className="course-keywords">
          {course.keywords.map((keyword) => (
            <span key={keyword}>{keyword}</span>
          ))}
        </div>
      )}
      <div className="course-card-foot">
        <span>
          <Clock3 size={13} />
          {course.lectureCount} 堂课 · {formatReadableDuration(course.totalSeconds)}
        </span>
        <span>{formatRelative(course.lastLectureAt)}</span>
      </div>
    </Link>
  );
}
