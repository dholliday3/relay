import { useState, useEffect, useRef } from "react";

export function FilterChip({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const active = selected.length > 0;

  return (
    <div className="filter-chip-wrapper" ref={ref}>
      <button
        className={`filter-chip-btn ${active ? "filter-chip-active" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        {label}
        {active && <span className="filter-chip-count">{selected.length}</span>}
        <svg className="filter-chip-chevron" width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
          <path d="M0 0l5 6 5-6z" />
        </svg>
      </button>
      {open && (
        <div className="filter-chip-dropdown">
          {options.length === 0 ? (
            <div className="filter-chip-empty">No options</div>
          ) : (
            options.map((opt) => (
              <button
                key={opt}
                className={`filter-chip-option ${selected.includes(opt) ? "filter-chip-option-selected" : ""}`}
                onClick={() => onToggle(opt)}
              >
                <span className="filter-chip-check">{selected.includes(opt) ? "\u2713" : ""}</span>
                {opt}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
