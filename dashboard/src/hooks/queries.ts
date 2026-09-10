/** Data hooks. Every screen reads through these; saves invalidate everything that could have moved. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type VersionMode } from "@/lib/api";
import type { Board } from "@/lib/types";

export const keys = {
  units: ["units"] as const,
  summary: (mode: VersionMode) => ["summary", mode] as const,
  board: (unit: string, mode: VersionMode) => ["board", unit, mode] as const,
  overview: (unit: string, mode: VersionMode) => ["overview", unit, mode] as const,
  versions: (unit: string) => ["versions", unit] as const,
  databoard: ["databoard"] as const,
};

export const useUnits = () => useQuery({ queryKey: keys.units, queryFn: api.units, staleTime: Infinity });
export const useSummary = (mode: VersionMode = "LATEST_APPROVED") => useQuery({ queryKey: keys.summary(mode), queryFn: () => api.summary(mode) });
export const useBoard = (unit: string, mode: VersionMode = "LATEST_APPROVED", enabled = true) =>
  useQuery({ queryKey: keys.board(unit, mode), queryFn: () => api.board(unit, mode), enabled });
export const useOverview = (unit: string, mode: VersionMode = "LATEST_APPROVED") =>
  useQuery({ queryKey: keys.overview(unit, mode), queryFn: () => api.overview(unit, mode) });
export const useVersions = (unit: string) => useQuery({ queryKey: keys.versions(unit), queryFn: () => api.versions(unit) });
export const useDataboard = () => useQuery({ queryKey: keys.databoard, queryFn: api.databoard });

/** After any finance write the summary and the databoard's derived figures change too. */
function useInvalidateFinance() {
  const qc = useQueryClient();
  return (unit: string) => Promise.all([
    qc.invalidateQueries({ queryKey: ["board", unit] }), qc.invalidateQueries({ queryKey: ["overview", unit] }),
    qc.invalidateQueries({ queryKey: ["versions", unit] }), qc.invalidateQueries({ queryKey: ["summary"] }),
    qc.invalidateQueries({ queryKey: keys.databoard }),
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
export function useSaveDataboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ weekEnding, doc, publish }: { weekEnding: string; doc: unknown; publish: boolean }) => api.saveDataboard(weekEnding, doc, publish),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.databoard }),
  });
}
