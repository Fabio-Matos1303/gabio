import { useEffect, useId, useRef, useState } from "react";
export function HelpTooltip({
  label,
  children,
}: {
  label: string;
  children: string;
}) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return (
    <span
      className="integration-help"
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!pinned && !ref.current?.contains(document.activeElement))
          setOpen(false);
      }}
    >
      <button
        type="button"
        className="integration-help-button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setPinned(false);
        }}
        onClick={() => {
          setPinned(!pinned);
          setOpen(!pinned);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            setPinned(false);
          }
        }}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open && (
        <span role="tooltip" id={id}>
          {children}
        </span>
      )}
    </span>
  );
}
