/**
 * The "As at" control every page shares. A pill-shaped button that opens a small panel: search a
 * month or year, pick from the newest twelve months (See more reveals the rest), or choose Latest,
 * All time or a custom from–to range. The choice lives in the shared period context.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePeriods } from "@/hooks/queries";
import { usePeriod } from "@/hooks/usePeriod";
import { matchesPeriod, periodKey, short, type PeriodSelection } from "@/lib/period";
import type { Period } from "@/lib/types";
import { Button, cx } from "./ui";

const PAGE = 12;

export function PeriodPicker({ label = "As at", note, disabled, extra }: { label?: string; note?: ReactNode; disabled?: boolean; extra?: ReactNode }) {
  const { selection, setSelection, label: value } = usePeriod();
  const periods = usePeriods();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  // Opens to the right of the pill unless that would run off the window, then hugs the pill's right edge.
  const [alignRight, setAlignRight] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  // Newest month first; the list is what the calendar holds, with what each month has beside it.
  const months = useMemo(() => [...(periods.data ?? [])].sort((a, b) => b.startsOn.localeCompare(a.startsOn)), [periods.data]);
  const matching = useMemo(() => (query.trim() ? months.filter((m) => matchesPeriod(m.label, query)) : months), [months, query]);
  const visible = matching.slice(0, shown);

  useEffect(() => {
    if (!open) return;
    setQuery(""); setShown(PAGE); setRange(null);
    const r = wrap.current?.getBoundingClientRect();
    setAlignRight(!!r && r.left + 300 > window.innerWidth - 16);
    setTimeout(() => search.current?.focus(), 0);
  }, [open]);
  useEffect(() => { setShown(PAGE); }, [query]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const choose = (s: PeriodSelection) => { setSelection(s); setOpen(false); };
  const current = periodKey(selection);
  const isOn = (s: PeriodSelection) => periodKey(s) === current;

  // A range starts from what is already selected, else the span of months that hold boards.
  const withBoards = months.filter((m) => m.approved.length);
  const openRange = () => setRange(selection.kind === "range" ? { from: selection.from, to: selection.to }
    : { from: (withBoards[withBoards.length - 1] ?? months[months.length - 1])?.label ?? "", to: (withBoards[0] ?? months[0])?.label ?? "" });
  const applyRange = () => {
    if (!range?.from || !range.to) return;
    const i = months.findIndex((m) => m.label === range.from), j = months.findIndex((m) => m.label === range.to);
    const [from, to] = i < j ? [range.to, range.from] : [range.from, range.to]; // months are newest-first, so a lower index is later
    choose({ kind: "range", from, to });
  };

  return (
    <div className={cx("period", !!extra && "has-extra")} ref={wrap}>
      <button type="button" className={cx("pill pill-btn", open && "open")} onClick={() => !disabled && setOpen((o) => !o)} disabled={disabled}
        aria-haspopup="dialog" aria-expanded={open} title={disabled ? "The period is fixed while a draft is open" : "Choose the reporting period"}>
        <label>{label}</label>
        <b>{value}<span className="chev" aria-hidden>▾</span></b>
        {note && <small className="pill-note">{note}</small>}
      </button>
      {extra && <span className="period-extra">{extra}</span>}

      {open && (
        <div className={cx("period-pop", alignRight && "align-right")} role="dialog" aria-label="Choose the reporting period">
          {range ? (
            <div className="period-range">
              <div className="period-head">Custom range</div>
              <label className="period-field"><span>From</span>
                <select value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })}>
                  {[...months].reverse().map((m) => <option key={m.label} value={m.label}>{m.label}</option>)}
                </select></label>
              <label className="period-field"><span>To</span>
                <select value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })}>
                  {[...months].reverse().map((m) => <option key={m.label} value={m.label}>{m.label}</option>)}
                </select></label>
              <p className="hint">Boards show as at the newest month in the range, with a month-by-month timeline underneath.</p>
              <div className="period-acts">
                <Button size="small" onClick={() => setRange(null)}>Back</Button>
                <Button size="small" variant="primary" onClick={applyRange} disabled={!range.from || !range.to}>Apply range</Button>
              </div>
            </div>
          ) : (
            <>
              <input ref={search} className="period-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a month or year…" aria-label="Search a month or year" />
              <div className="period-quick">
                <button type="button" className={cx("chipbtn", isOn({ kind: "latest" }) && "on")} onClick={() => choose({ kind: "latest" })} title="Each board's newest approved month">Latest</button>
                <button type="button" className={cx("chipbtn", isOn({ kind: "all" }) && "on")} onClick={() => choose({ kind: "all" })} title="The whole timeline">All time</button>
                <button type="button" className={cx("chipbtn", selection.kind === "range" && "on")} onClick={openRange}>{selection.kind === "range" ? `${short(selection.from)} – ${short(selection.to)} ✎` : "Custom range…"}</button>
              </div>
              <div className="period-list" role="listbox" aria-label="Months">
                {periods.isLoading && <div className="period-empty">Loading months…</div>}
                {periods.error && <div className="period-empty">Could not load the months.</div>}
                {!periods.isLoading && !visible.length && <div className="period-empty">No month matches “{query}”.</div>}
                {visible.map((m) => (
                  <button type="button" key={m.label} role="option" aria-selected={isOn({ kind: "month", label: m.label })}
                    className={cx("period-opt", isOn({ kind: "month", label: m.label }) && "on", !m.approved.length && "bare")}
                    onClick={() => choose({ kind: "month", label: m.label })}>
                    <span>{m.label}</span><MonthNote m={m} />
                  </button>
                ))}
              </div>
              {matching.length > shown && (
                <button type="button" className="period-more" onClick={() => setShown((s) => s + PAGE)}>
                  See more <small>{matching.length - shown} older month{matching.length - shown === 1 ? "" : "s"}</small>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** What a month holds, in a few words: "3 boards", "1 board · placeholder", "draft only", or nothing. */
function MonthNote({ m }: { m: Period }) {
  const n = m.approved.length;
  if (!n && !m.drafts.length) return <small>—</small>;
  if (!n) return <small className="c-amber">draft only</small>;
  return <small>{n} board{n === 1 ? "" : "s"}{m.placeholder ? " · placeholder" : ""}{m.drafts.length ? ` · ${m.drafts.length} draft` : ""}</small>;
}
