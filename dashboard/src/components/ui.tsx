/** Small building blocks, all styled from the brand-kit tokens. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Light } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/format";

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

/* ---------- surfaces ---------- */
export function Card({ children, className, solid, accent, title, tools, id }: { children: ReactNode; className?: string; solid?: boolean; accent?: "blue" | "gold" | "amber"; title?: ReactNode; tools?: ReactNode; id?: string }) {
  return (
    <section id={id} className={cx("card", solid && "card-solid", accent && `accent-${accent}`, className)}>
      {(title || tools) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {tools && <div className="card-tools">{tools}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function SectionHead({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="section-head">
      <h2>{title}</h2><div className="rule" />{hint && <span className="hint">{hint}</span>}
    </div>
  );
}

/* ---------- status ---------- */
export function Dot({ colour, title }: { colour: Light | "blue" | "muted"; title?: string }) {
  return <span className={`dot dot-${colour}`} title={title ?? (colour in STATUS_LABEL ? STATUS_LABEL[colour as Light] : undefined)} />;
}
export function Chip({ colour, children, title, className }: { colour: Light | "blue" | "gold"; children: ReactNode; title?: string; className?: string }) {
  return <span className={cx("chip", `chip-${colour}`, className)} title={title}>{children}</span>;
}
/** A small label; with `onClick` it is a button that looks the same, for a badge that leads somewhere. */
export function Badge({ children, tone = "blue", title, onClick }: { children: ReactNode; tone?: "blue" | "amber" | "muted"; title?: string; onClick?: () => void }) {
  if (onClick) return <button type="button" className={`badge badge-${tone} badge-btn`} title={title} onClick={onClick}>{children}</button>;
  return <span className={`badge badge-${tone}`} title={title}>{children}</span>;
}
/** Traffic light. A button while editable (click cycles), a labelled span otherwise. */
export function TrafficLight({ colour, size, onCycle, title }: { colour: Light; size?: "ov" | "mini"; onCycle?: () => void; title?: string }) {
  const label = title ?? STATUS_LABEL[colour];
  if (onCycle) return <button type="button" className={cx("light", `light-${colour}`, size)} title={`${label} — click to change`} aria-label={label} onClick={onCycle} />;
  return <span className={cx("light", `light-${colour}`, size)} role="img" aria-label={label} title={label} />;
}
export const nextLight: Record<Light, Light> = { green: "amber", amber: "red", red: "green" };

/* ---------- controls ---------- */
export function Button({ children, variant = "ghost", size, onClick, disabled, type = "button", title, className }: {
  children: ReactNode; variant?: "primary" | "ghost" | "gold" | "dashed" | "danger"; size?: "small"; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; title?: string; className?: string;
}) {
  return <button type={type} className={cx("btn", `btn-${variant}`, size && `btn-${size}`, className)} onClick={onClick} disabled={disabled} title={title}>{children}</button>;
}

export function NumberInput({ value, onChange, className, min, max, ariaLabel }: { value: number; onChange: (v: number) => void; className?: string; min?: number; max?: number; ariaLabel?: string }) {
  const [text, setText] = useState(String(value ?? 0));
  useEffect(() => { setText(String(value ?? 0)); }, [value]);
  return (
    <input className={cx("num", className)} type="number" value={text} min={min} max={max} aria-label={ariaLabel}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { const n = Number(text); onChange(isNaN(n) ? 0 : n); }} />
  );
}
export function TextInput({ value, onChange, placeholder, className, ariaLabel }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; ariaLabel?: string }) {
  return <input className={cx("txt", className)} value={value ?? ""} placeholder={placeholder} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)} />;
}
export function TextArea({ value, onChange, placeholder, rows }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return <textarea value={value ?? ""} placeholder={placeholder} rows={rows} onChange={(e) => onChange(e.target.value)} />;
}

/** A card's way in and out of editing: a pencil that shows on hover or focus, then keep / cancel. */
export function EditTools({ open, label, onEdit, onKeep, onCancel }: {
  open: boolean; label: string; onEdit: () => void; onKeep: () => void; onCancel: () => void;
}) {
  if (!open) return <button type="button" className="rowbtn pencil card-pencil" title={`Edit ${label}`} aria-label={`Edit ${label}`} onClick={onEdit}>✎</button>;
  return (
    <>
      <button type="button" className="rowbtn ok" title="Keep these changes" aria-label={`Keep changes to ${label}`} onClick={onKeep}>✓</button>
      <button type="button" className="rowbtn no" title="Cancel" aria-label={`Cancel editing ${label}`} onClick={onCancel}>✕</button>
    </>
  );
}

/** Sticky bar that appears once a draft session has unsaved line edits. Carries the save actions
 *  that used to live in the page header, so nothing reaches the server until it is used. */
export function SaveBar({ label, discardLabel = "Discard", saving, onSaveDraft, onPublish, onDiscard }: {
  label: string; discardLabel?: string; saving?: boolean; onSaveDraft: () => void; onPublish: () => void; onDiscard: () => void;
}) {
  return (
    <div className="savebar" role="region" aria-label="Unsaved changes">
      <div className="savebar-in">
        <p className="savebar-count"><b>{label}</b><span>The approved figures stay as they are until you publish.</span></p>
        <div className="savebar-acts">
          <Button onClick={onDiscard} disabled={saving}>{discardLabel}</Button>
          <Button onClick={onSaveDraft} disabled={saving}>Save draft</Button>
          <Button variant="primary" onClick={onPublish} disabled={saving}>Save &amp; publish</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- modal ---------- */
/** A dialog over the page. Solid, like the save bar: one glass layer per level. Escape or the backdrop closes it. */
export function Modal({ title, children, footer, onClose, wide }: { title: ReactNode; children: ReactNode; footer?: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={cx("modal", wide && "modal-wide")} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="rowbtn no" title="Close" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/* ---------- banners & states ---------- */
export function Banner({ tone, children }: { tone: "amber" | "green" | "blue" | "red"; children: ReactNode }) {
  return <div className={`banner banner-${tone}`}>{children}</div>;
}
export function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div>; }
export function Loading({ what = "board" }: { what?: string }) { return <div className="loading" role="status">Loading the {what}…</div>; }
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <Card accent="amber">
      <h2 className="h-amber">Could not load</h2>
      <p className="intro">{msg}. Is the backend running on port 3000?</p>
      {retry && <Button onClick={retry}>Try again</Button>}
    </Card>
  );
}

/* ---------- KPI tile ---------- */
export function Kpi({ label, value, sub, colour, delta, feature }: { label: string; value: ReactNode; sub?: ReactNode; colour?: Light | "blue"; delta?: ReactNode; feature?: boolean }) {
  return (
    <div className={cx("card kpi", feature && "kpi-feature")}>
      <div className="kpi-label">{colour && !feature && <Dot colour={colour} />}{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {delta && <div className="kpi-delta">{colour && !feature ? <Chip colour={colour}>{delta}</Chip> : <span className="trend-light">{delta}</span>}</div>}
    </div>
  );
}

/* ---------- toast ---------- */
type Toast = { id: number; text: string; tone: "ok" | "warn" };
const ToastCtx = createContext<(text: string, tone?: "ok" | "warn") => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: "ok" | "warn" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={cx("toast", t.tone)}>{t.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}

/* ---------- global search (topbar) ---------- */
const SearchCtx = createContext<{ query: string; setQuery: (q: string) => void }>({ query: "", setQuery: () => {} });
export const useSearch = () => useContext(SearchCtx);
export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const value = useMemo(() => ({ query, setQuery }), [query]);
  return <SearchCtx.Provider value={value}>{children}</SearchCtx.Provider>;
}
