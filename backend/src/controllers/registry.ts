/** Small presenters for registry objects: units, periods, versions. */
import type { PeriodDoc, UnitDoc } from "@/services/structure";
import type { VersionDoc } from "@/services/workflow";

export const presentUnit = (u: UnitDoc) => ({
  code: u.code, name: u.name, short: u.shortName, type: u.unitType, location: u.location, colour: u.colourHex, order: u.displayOrder,
});

export const presentPeriod = (p: PeriodDoc) => ({
  id: String(p._id), label: p.label, periodNo: p.periodNo, startsOn: p.startsOn.toISOString().slice(0, 10), endsOn: p.endsOn.toISOString().slice(0, 10), status: p.status,
});

export const presentVersion = (v: VersionDoc) => ({
  id: String(v._id), versionNo: v.versionNo, status: v.status, placeholder: v.isPlaceholder,
  supersedes: v.supersedesVersionId ? String(v.supersedesVersionId) : null, importBatch: v.importBatchId ? String(v.importBatchId) : null,
  createdAt: v.createdAt?.toISOString() ?? null, updatedAt: v.updatedAt?.toISOString() ?? null, approvedAt: v.approvedAt?.toISOString() ?? null, notes: v.notes,
});
