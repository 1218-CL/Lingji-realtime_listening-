import { initials } from "../lib/format";

interface AvatarProps {
  name: string;
  size?: number;
  className?: string;
}

export function Avatar({ name, size = 36, className = "" }: AvatarProps) {
  return (
    <span
      className={`avatar ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.36) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
