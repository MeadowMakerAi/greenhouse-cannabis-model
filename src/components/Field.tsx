import { useEffect, useRef, useState, type ReactNode } from "react";

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  hint?: string;
  /**
   * When set, the field holds a local draft while typing and only commits
   * `onChange` after this idle delay (and immediately on blur). Used for
   * geometry inputs so erasing "48" → "4" doesn't flash a 4-ft greenhouse
   * mid-edit — the scene waits until the user finishes. Omit for instant
   * (live) inputs.
   */
  debounceMs?: number;
}

export function NumberField({ label, value, onChange, step = 1, min, max, unit, hint, debounceMs }: NumberFieldProps) {
  // Draft holds the in-progress text only while debouncing. null = "show the
  // committed prop value" (so external changes — presets, canopy auto-scale —
  // flow straight through when the user isn't mid-edit).
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  // parseFloat returns NaN for "", "-", ".", etc. — propagating NaN through
  // setInputs poisoned canopyAreaSqFt and crashed the 3D scene with a cascade
  // of NaN positions (Codex P1). So partial/empty input never commits.
  const tryParse = (raw: string): number | null => {
    if (raw === "" || raw === "-" || raw === ".") return null;
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handleChange = (raw: string) => {
    const parsed = tryParse(raw);
    if (!debounceMs) {
      if (parsed !== null) onChange(parsed);
      return;
    }
    // Debounced: reflect the keystroke locally, commit after the idle delay.
    setDraft(raw);
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (parsed !== null) {
      timer.current = window.setTimeout(() => onChange(parsed), debounceMs);
    }
  };

  const handleBlur = (raw: string) => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const parsed = tryParse(raw);
    if (parsed !== null) onChange(parsed);
    setDraft(null); // resync display to the committed value
  };

  const display =
    debounceMs && draft !== null ? draft : Number.isFinite(value) ? value : 0;

  return (
    <div>
      <label className="field-label">
        {label}
        {unit ? <span className="ml-1 text-ink-300">[{unit}]</span> : null}
      </label>
      <input
        type="number"
        value={display}
        step={step}
        min={min}
        max={max}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={debounceMs ? (e) => handleBlur(e.target.value) : undefined}
      />
      {hint ? <p className="mt-1 text-[11px] text-ink-500">{hint}</p> : null}
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hint?: string;
}

export function SelectField<T extends string>({ label, value, onChange, options, hint }: SelectFieldProps<T>) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <p className="mt-1 text-[11px] text-ink-500">{hint}</p> : null}
    </div>
  );
}

interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (b: boolean) => void;
  hint?: string;
}

export function ToggleField({ label, value, onChange, hint }: ToggleProps) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
      />
      <span>
        <span className="font-medium text-ink-700">{label}</span>
        {hint ? <span className="block text-[11px] text-ink-500">{hint}</span> : null}
      </span>
    </label>
  );
}

/**
 * Editorial sidebar section. No card chrome — a small-caps title + hairline
 * rule + collapsible body. Pattern is Figma right-panel + Bloomberg Terminal
 * function block, not the SaaS-default stacked-card sidebar.
 *
 * Uses native `<details>` for the toggle so it works without JS state and
 * preserves keyboard navigation. The marker rotates 90° when open via
 * `[open]` selector in index.css.
 */
export function FieldGroup({
  title,
  description,
  children,
  defaultOpen = true,
  rightSlot,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  rightSlot?: ReactNode;
}) {
  return (
    <details className="sidebar-section" open={defaultOpen}>
      <summary className="sidebar-section-header">
        <span className="sidebar-section-caret" aria-hidden>
          ▸
        </span>
        <span className="sidebar-section-title">{title}</span>
        {rightSlot ? (
          <span className="sidebar-section-right">{rightSlot}</span>
        ) : null}
      </summary>
      <div className="sidebar-section-body">
        {description ? (
          <p className="text-[11px] leading-snug text-ink-500">{description}</p>
        ) : null}
        <div className="grid grid-cols-2 gap-3">{children}</div>
      </div>
    </details>
  );
}
