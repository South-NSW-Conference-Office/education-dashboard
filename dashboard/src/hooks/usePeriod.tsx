/**
 * The period selection shared by every page. Kept in the URL (?period=…) so a link carries it,
 * and in session storage so it follows the reader between pages that do not.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { LATEST, parsePeriodKey, periodKey, periodLabel, periodParams, type PeriodParams, type PeriodSelection } from "@/lib/period";

const STORAGE = "snsw.period";
const read = (): PeriodSelection => { try { return parsePeriodKey(sessionStorage.getItem(STORAGE)); } catch { return LATEST; } };
const write = (s: PeriodSelection) => { try { sessionStorage.setItem(STORAGE, periodKey(s)); } catch { /* private mode */ } };

interface PeriodCtx { selection: PeriodSelection; setSelection: (s: PeriodSelection) => void; params: PeriodParams; key: string; label: string }
const Ctx = createContext<PeriodCtx>({ selection: LATEST, setSelection: () => {}, params: {}, key: "latest", label: "Latest" });
export const usePeriod = () => useContext(Ctx);

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useSearchParams();
  const fromUrl = search.get("period");
  const [selection, set] = useState<PeriodSelection>(() => (fromUrl ? parsePeriodKey(fromUrl) : read()));
  // A link that names a period wins over what the session remembers.
  useEffect(() => { if (fromUrl && fromUrl !== periodKey(selection)) set(parsePeriodKey(fromUrl)); }, [fromUrl]); // selection deliberately left out: only a changed link should override it
  const setSelection = useCallback((s: PeriodSelection) => {
    set(s); write(s);
    setSearch((prev) => { const n = new URLSearchParams(prev); if (s.kind === "latest") n.delete("period"); else n.set("period", periodKey(s)); return n; }, { replace: true });
  }, [setSearch]);
  const value = useMemo<PeriodCtx>(() => ({ selection, setSelection, params: periodParams(selection), key: periodKey(selection), label: periodLabel(selection) }), [selection, setSelection]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
