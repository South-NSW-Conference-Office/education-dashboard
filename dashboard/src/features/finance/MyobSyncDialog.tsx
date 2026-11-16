/**
 * Manual MYOB sync. The request can sit on the ledger for a while, so the dialog stays on
 * "reading" until the API answers with a status (including disabled / not_configured) or an error.
 * A saved school names the month it loaded via sourceLabel.
 */
import { Badge, Banner, Button, Loading, Modal } from "@/components/ui";
import type { MyobSyncResult, MyobUnitSync, Unit } from "@/lib/types";

const COPY: Record<MyobSyncResult["status"], { tone: "green" | "blue" | "red"; title: string }> = {
  ok: { tone: "green", title: "Sync finished" },
  partial: { tone: "blue", title: "Sync finished with gaps" },
  failed: { tone: "red", title: "Sync failed" },
  disabled: { tone: "blue", title: "Sync is off" },
  not_configured: { tone: "blue", title: "MYOB is not configured" },
};

const schoolName = (code: string, units: Unit[]) => units.find((u) => u.code === code)?.name ?? code;

function schoolLine(u: MyobUnitSync): string {
  if (u.sourceLabel && !u.message.includes(u.sourceLabel)) return `${u.sourceLabel}. ${u.message}`;
  return u.message || u.sourceLabel || "";
}

export function MyobSyncDialog({ pending, error, result, units, onClose }: {
  pending: boolean; error: unknown; result?: MyobSyncResult; units: Unit[]; onClose: () => void;
}) {
  const title = "Sync from MYOB";
  if (pending || (!result && !error)) {
    return (
      <Modal title={title} onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
        <Loading what="year-to-date figures from MYOB" />
        <p className="hint">Reading the latest closed month. An approved operating report for that month, or a later one, stays what the boards show.</p>
      </Modal>
    );
  }
  if (error && !result) {
    const message = error instanceof Error ? error.message : "The sync could not be completed";
    return (
      <Modal title={title} onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
        <Banner tone="red"><b>Could not sync from MYOB.</b> {message}</Banner>
      </Modal>
    );
  }
  if (!result) return null;
  const copy = COPY[result.status] ?? { tone: "red" as const, title: "Sync failed" };
  const saved = result.units.filter((u) => u.status === "saved").length;
  const skipped = result.units.filter((u) => u.status === "skipped").length;
  const failed = result.units.filter((u) => u.status === "failed").length;
  return (
    <Modal title={title} onClose={onClose} wide={result.units.length > 0} footer={<Button onClick={onClose}>Close</Button>}>
      <Banner tone={copy.tone}><b>{copy.title}.</b> Status: {result.status}. {result.message}</Banner>
      {(result.period || result.units.length > 0) && (
        <div className="import-meta">
          {result.period && <span className="pill"><label>Month</label><b>{result.period}</b></span>}
          {result.units.length > 0 && <span className="pill"><label>Schools</label><b>{saved} loaded{skipped ? ` · ${skipped} skipped` : ""}{failed ? ` · ${failed} failed` : ""}</b></span>}
        </div>
      )}
      {result.units.length > 0 && (
        <ul className="myob-results">
          {result.units.map((u) => (
            <li key={u.unit}>
              <div><b>{schoolName(u.unit, units)}</b> <Badge tone="muted">{u.status}</Badge></div>
              <p className="hint">{schoolLine(u)}</p>
              {u.comparisonNote && <p className="hint">{u.comparisonNote}</p>}
              {u.pdfRemainsAuthoritative && !/stays on the dashboard/i.test(u.message) && <p className="hint">An approved operating report for this month or a later one stays on the dashboard.</p>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
