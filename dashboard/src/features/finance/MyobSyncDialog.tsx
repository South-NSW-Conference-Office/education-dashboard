/**
 * Manual MYOB sync. POST returns immediately; a full year is one month at a time and takes
 * about twelve minutes, so this dialog reads the polled status. Closing it does not stop the run.
 */
import { Badge, Banner, Button, Modal } from "@/components/ui";
import { myobProgressLine } from "@/lib/myobStatus";
import type { MyobLastResult, MyobProgress, MyobSyncDeclined, MyobSyncLog, MyobUnitSync, Unit } from "@/lib/types";

const COPY: Record<string, { tone: "green" | "blue" | "red"; title: string }> = {
  OK: { tone: "green", title: "Sync finished" },
  PARTIAL: { tone: "blue", title: "Sync finished with gaps" },
  FAILED: { tone: "red", title: "Sync failed" },
  disabled: { tone: "blue", title: "Sync is off" },
  not_configured: { tone: "blue", title: "MYOB is not configured" },
};

const schoolName = (code: string, units: Unit[]) => units.find((u) => u.code === code)?.name ?? code;

function schoolLine(u: MyobUnitSync): string {
  if (u.sourceLabel && u.message && !u.message.includes(u.sourceLabel)) return `${u.sourceLabel}. ${u.message}`;
  return u.message || u.sourceLabel || "";
}

export function MyobSyncDialog({ starting, error, declined, status, units, onClose }: {
  starting: boolean; error: unknown; declined: MyobSyncDeclined | null; status?: MyobSyncLog; units: Unit[]; onClose: () => void;
}) {
  const title = "Sync from MYOB";
  const close = <Button onClick={onClose}>Close</Button>;
  if (status?.running) return <ProgressDialog progress={status.progress} units={units} onClose={onClose} />;
  if (starting || (!declined && !error && !status?.lastResult)) {
    return (
      <Modal title={title} onClose={onClose} footer={close}>
        <p className="hint" role="status">Starting the MYOB sync…</p>
      </Modal>
    );
  }
  if (error) {
    const message = error instanceof Error ? error.message : "The sync could not be completed";
    return (
      <Modal title={title} onClose={onClose} footer={close}>
        <Banner tone="red"><b>Could not sync from MYOB.</b> {message}</Banner>
      </Modal>
    );
  }
  if (declined) {
    const copy = COPY[declined.status] ?? { tone: "blue" as const, title: "Sync did not start" };
    return (
      <Modal title={title} onClose={onClose} footer={close}>
        <Banner tone={copy.tone}><b>{copy.title}.</b> Status: {declined.status}. {declined.message}{/\bnothing was read\b/i.test(declined.message) ? "" : " Nothing was read or written."}</Banner>
      </Modal>
    );
  }
  if (status?.lastResult) return <ResultDialog result={status.lastResult} lastError={status.lastError} units={units} onClose={onClose} />;
  return (
    <Modal title={title} onClose={onClose} footer={close}>
      <p className="hint" role="status">Starting the MYOB sync…</p>
    </Modal>
  );
}

function ProgressDialog({ progress, units, onClose }: { progress: MyobProgress | null; units: Unit[]; onClose: () => void }) {
  const line = myobProgressLine(progress);
  return (
    <Modal title="Sync from MYOB" onClose={onClose} wide footer={<Button onClick={onClose}>Close</Button>}>
      <p className="hint" role="status"><b>{line}</b></p>
      <p className="hint">Each month is read on its own. A full year usually takes about twelve minutes. You can close this and come back — the sync keeps going.</p>
      {progress && progress.months.length > 0 && (
        <ul className="myob-results">
          {progress.months.map((m) => (
            <li key={m.period} className={m.status === "running" ? "myob-current" : undefined}>
              <div><b>{m.label}</b> <span className="hint">{m.status}{m.rows != null ? ` · ${m.rows.toLocaleString("en-AU")} rows` : ""}</span></div>
              {m.error && <p className="hint">{m.error}</p>}
            </li>
          ))}
        </ul>
      )}
      {progress && progress.schools.some((s) => s.status !== "pending") && (
        <ul className="myob-results">
          {progress.schools.map((s) => (
            <li key={s.unit} className={s.status === "running" ? "myob-current" : undefined}>
              <div><b>{schoolName(s.unit, units)}</b> <span className="hint">{s.status}</span></div>
              {s.message && <p className="hint">{s.message}</p>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function ResultDialog({ result, lastError, units, onClose }: { result: MyobLastResult; lastError: string | null; units: Unit[]; onClose: () => void }) {
  const copy = COPY[result.status] ?? { tone: "red" as const, title: "Sync failed" };
  const saved = result.units.filter((u) => u.status === "saved").length;
  const skipped = result.units.filter((u) => u.status === "skipped").length;
  const failed = result.units.filter((u) => u.status === "failed").length;
  return (
    <Modal title="Sync from MYOB" onClose={onClose} wide={result.units.length > 0} footer={<Button onClick={onClose}>Close</Button>}>
      <Banner tone={copy.tone}><b>{copy.title}.</b> Status: {result.status}. {result.message}</Banner>
      {lastError && lastError !== result.message && <p className="hint">{lastError}</p>}
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
