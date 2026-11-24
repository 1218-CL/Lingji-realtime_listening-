import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
  closeLabel?: string;
}

export function Modal({
  open,
  onClose,
  children,
  className = "",
  labelledBy,
  closeLabel = "关闭",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  // Parent forms re-render on every keystroke. Keep the latest close callback in
  // a ref so opening/focusing is not re-run (and focus is not stolen) each time.
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      const formField = panelRef.current?.querySelector<HTMLElement>(
        "input:not([type='hidden']), textarea, select",
      );
      const fallback = panelRef.current?.querySelector<HTMLElement>(
        "button:not(.modal-close), [tabindex]:not([tabindex='-1'])",
      );
      (formField || fallback)?.focus();
    }, 80);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`modal-card ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        ref={panelRef}
      >
        <button className="modal-close" onClick={onClose} aria-label={closeLabel}>
          <X size={18} />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
