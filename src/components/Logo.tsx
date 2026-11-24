import { Link } from "react-router-dom";

interface LogoProps {
  light?: boolean;
  compact?: boolean;
  to?: string;
}

export function Logo({ light = false, compact = false, to = "/" }: LogoProps) {
  return (
    <Link className={`logo ${light ? "logo-light" : ""}`} to={to} aria-label="聆记首页">
      <span className="logo-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="12" fill="currentColor" />
          <g stroke={light ? "#9bf1eb" : "#fff"} strokeWidth="2.6" strokeLinecap="round">
            <path d="M11.5 17v6" />
            <path d="M16.5 13v14" />
            <path d="M21.5 9.5v21" />
            <path d="M26.5 14.5v11" />
            <path d="M31.5 17.5v5" />
          </g>
        </svg>
      </span>
      {!compact && (
        <span className="logo-type">
          <strong>聆记</strong>
          <em>LINGJI</em>
        </span>
      )}
    </Link>
  );
}
