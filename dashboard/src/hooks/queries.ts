/**
 * Data hooks. Every screen reads through these; saves invalidate everything that could have moved.
 * Reads that depend on the reporting period take it from the shared selection (usePeriod), so
 * changing the period in the header refetches every page the same way.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type VersionMode } from "@/lib/api";
import type { Board, MyobSyncDeclined } from "@/lib/types";
import { isSpan } from "@/lib/period";
import { usePeriod } from "./usePeriod";

export const keys = {
  units: ["units"] as const,
  periods: ["periods"] as const,
  summary: (mode: VersionMode, period: string) => ["summary", mode, period] as const,
  board: (unit: string, mode: VersionMode, period: string) => ["board", unit, mode, period] as const,
  overview: (unit: string, mode: VersionMode, period: string) => ["overview", unit, mode, period] as const,
  versions: (unit: string) => ["versions", unit] as const,
  timeline: (period: string, unit?: string) => ["timeline", period, unit ?? "*"] as const,
  databoard: (period: string) => ["databoard", period] as const,
  myob: ["myob-sync"] as const,
};

export const useUnits = () => useQuery({ queryKey: keys.units, queryFn: api.units, staleTime: Infinity });
export const usePeriods = () => useQuery({ queryKey: keys.periods, queryFn: api.periods, staleTime: 60_000 });
export function useSummary(mode: VersionMode = "LATEST_APPROVED") {
  const { params, key } = usePeriod();
  return useQuery({ queryKey: keys.summary(mode, key), queryFn: () => api.summary(mode, params) });
}
export function useBoard(unit: string, mode: VersionMode = "LATEST_APPROVED", enabled = true) {
  const { params, key } = usePeriod();
  return useQuery({ queryKey: keys.board(unit, mode, key), queryFn: () => api.board(unit, mode, params), enabled });
}
export function useOverview(unit: string, mode: VersionMode = "LATEST_APPROVED") {
  const { params, key } = usePeriod();
  return useQuery({ queryKey: keys.overview(unit, mode, key), queryFn: () => api.overview(unit, mode, params) });
}
export const useVersions = (unit: string) => useQuery({ queryKey: keys.versions(unit), queryFn: () => api.versions(unit) });
/** Only fetched while a range or all time is selected: a single month has no timeline. */
export function useTimeline(unit?: string) {
  const { selection, params, key } = usePeriod();
  return useQuery({ queryKey: keys.timeline(key, unit), queryFn: () => api.timeline(params, unit), enabled: isSpan(selection) });
}
export function useDataboard() {
  const { params, key } = usePeriod();
  return useQuery({ queryKey: keys.databoard(key), queryFn: () => api.databoard(params) });
}

/** After any finance write the summary, the timeline, the period list and the databoard's derived figures change too. */
function useInvalidateFinance() {
  const qc = useQueryClient();
  return (unit: string) => Promise.all([
    qc.invalidateQueries({ queryKey: ["board", unit] }), qc.invalidateQueries({ queryKey: ["overview", unit] }),
    qc.invalidateQueries({ queryKey: ["versions", unit] }), qc.invalidateQueries({ queryKey: ["summary"] }),
    qc.invalidateQueries({ queryKey: ["timeline"] }), qc.invalidateQueries({ queryKey: keys.periods }),
    qc.invalidateQueries({ queryKey: ["databoard"] }),
  ]);
}

export function useSaveBoard(unit: string) {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ board, publish }: { board: Board; publish: boolean }) => api.saveBoard(unit, board, publish),
    onSuccess: () => invalidate(unit),
  });
}
export function useApproveVersion(unit: string) {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (versionId: string) => api.approve(unit, versionId), onSuccess: () => invalidate(unit) });
}
/** Reading the PDF writes nothing a screen shows, so only publishing invalidates. */
export function useUploadReportPdf(unit: string) {
  return useMutation({ mutationFn: (file: File) => api.uploadReportPdf(unit, file) });
}
export function usePublishImport(unit: string) {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: ({ id, approve }: { id: string; approve: boolean }) => api.publishImport(id, approve), onSuccess: () => invalidate(unit) });
}
function refreshFinance(qc: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["board"] }), qc.invalidateQueries({ queryKey: ["overview"] }),
    qc.invalidateQueries({ queryKey: ["versions"] }), qc.invalidateQueries({ queryKey: ["summary"] }),
    qc.invalidateQueries({ queryKey: ["timeline"] }), qc.invalidateQueries({ queryKey: keys.periods }),
    qc.invalidateQueries({ queryKey: ["databoard"] }), qc.invalidateQueries({ queryKey: keys.myob }),
  ]);
}

/**
 * The sync status. While `running` is true this polls about every five seconds, including after a
 * reload, and when the run finishes it refreshes the boards. Readers who cannot import do not call it.
 */
export function useMyobSync(enabled = true) {
  const qc = useQueryClient();
  const wasRunning = useRef(false);
  const q = useQuery({
    queryKey: keys.myob,
    queryFn: api.myobSync,
    enabled,
    staleTime: 0,
    refetchInterval: (query) => (query.state.data?.running ? 5_000 : false),
    refetchIntervalInBackground: true,
  });
  useEffect(() => {
    const running = !!q.data?.running;
    if (wasRunning.current && !running) void refreshFinance(qc);
    wasRunning.current = running;
  }, [q.data?.running, qc]);
  return q;
}

/** Start a sync unless one is already being polled, and remember a disabled / not_configured answer. */
export function useMyobRun(enabled: boolean) {
  const log = useMyobSync(enabled);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [declined, setDeclined] = useState<MyobSyncDeclined | null>(null);
  const start = async () => {
    if (log.data?.running) return;
    setError(null);
    setDeclined(null);
    setStarting(true);
    try {
      const res = await api.syncFromMyob();
      if (res.status === "running") await log.refetch();
      else if (res.status === "disabled" || res.status === "not_configured") setDeclined(res);
    } catch (e) { setError(e); }
    finally { setStarting(false); }
  };
  return { status: log.data, starting, error, declined, start };
}

export function useSaveDataboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ weekEnding, doc, publish }: { weekEnding: string; doc: unknown; publish: boolean }) => api.saveDataboard(weekEnding, doc, publish),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["databoard"] }),
  });
}
