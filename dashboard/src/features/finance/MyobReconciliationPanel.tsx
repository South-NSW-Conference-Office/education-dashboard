/**
 * The last MYOB sync, for the school on screen: each report line's ledger YTD against the PDF,
 * then accounts the operating report does not list. Readers without imports.write never mount this.
 */
import { useMyobSync, useUnits } from "@/hooks/queries";
import { Card, Empty, ErrorState, Loading } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { fmt$, when } from "@/lib/format";
import type { MyobReconciliation, MyobSyncLog, MyobUnitSync } from "@/lib/types";

export function MyobReconciliationPanel({ unit }: { unit: string }) {
  const q = useMyobSync();
  const units = useUnits();
  const name = units.data?.find((u) => u.code === unit)?.name ?? unit;
  return <MyobReconciliationView unit={unit} unitName={name} log={q.data} error={q.isError ? q.error : null} loading={q.isPending} onRetry={() => { void q.refetch(); }} />;
}

export function MyobReconciliationView({ unit, unitName, log, error, loading, onRetry }: {
  unit: string; unitName: string; log?: MyobSyncLog; error: unknown; loading: boolean; onRetry?: () => void;
}) {
  const title = "MYOB reconciliation";
  if (loading && !log) return <Card title={title}><Loading what="MYOB reconciliation" /></Card>;
  if (error && !log) {
    if (error instanceof ApiError && error.status === 404) return <Card title={title}><Empty>MYOB sync is not available on this server yet.</Empty></Card>;
    return <ErrorState error={error} retry={onRetry} />;
  }
  if (!log?.lastRun) {
    return (
      <Card title={title}>
        <Empty>{log && !log.enabled ? "MYOB sync is off, and no sync has been recorded." : "No MYOB sync has been recorded yet."}</Empty>
      </Card>
    );
  }
  const run = log.lastRun;
  const row = run.units.find((u) => u.unit === unit);
  return (
    <Card title={title} tools={<span className="hint">{unitName}</span>} id="myob-reconciliation">
      <p className="hint">
        Last sync{run.period ? ` for ${run.period}` : ""} · status {run.status.toLowerCase()}
        {run.finishedAt ? ` · ${when(run.finishedAt)}` : ""}
        {run.message ? `. ${run.message}` : ""}
      </p>
      {!row && <Empty>{unitName} was not in that sync.</Empty>}
      {row && !row.reconciliation && <Empty>{row.message || "No line comparison was stored for this school."}</Empty>}
      {row?.reconciliation && <ReconTables recon={row.reconciliation} row={row} />}
    </Card>
  );
}

function ReconTables({ recon, row }: { recon: MyobReconciliation; row: MyobUnitSync }) {
  const { surplus } = recon;
  return (
    <>
      <p className="hint">
        PDF surplus {fmt$(surplus.pdf)} · MYOB on report lines {fmt$(surplus.myobOnReportLines)} · difference {fmt$(surplus.differenceOnReportLines)}
        {(surplus.unmappedIncome !== 0 || surplus.unmappedExpense !== 0) && <> · unmapped income {fmt$(surplus.unmappedIncome)}, unmapped expense {fmt$(surplus.unmappedExpense)}</>}
      </p>
      {row.comparisonNote && <p className="hint">{row.comparisonNote}</p>}
      {!recon.lines.length && !recon.unmapped.length
        ? <Empty>No line comparison was stored for this school.</Empty>
        : <>
          {recon.lines.length > 0 && (
            <div className="table-scroll myob-scroll">
              <table className="ftable">
                <thead><tr><th>Line</th><th>MYOB YTD</th><th>PDF YTD</th><th>Difference</th></tr></thead>
                <tbody>
                  {recon.lines.map((line) => (
                    <tr key={`${line.accountCode}-${line.label}`}>
                      <td><span className="mono">{line.accountCode}</span> {line.label}{line.note && <span className="hint">{line.note}</span>}</td>
                      <td>{fmt$(line.myobYtd)}</td>
                      <td>{fmt$(line.pdfYtd)}</td>
                      <td className={line.difference ? "" : "muted"}>{fmt$(line.difference)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3 className="tl-sub">Unmapped accounts</h3>
          {recon.unmapped.length
            ? (
              <div className="table-scroll myob-scroll">
                <table className="ftable">
                  <thead><tr><th>Account</th><th>MYOB YTD</th></tr></thead>
                  <tbody>
                    {recon.unmapped.map((a) => (
                      <tr key={a.accountCode}><td><span className="mono">{a.accountCode}</span> {a.name}{a.type ? ` · ${a.type}` : ""}</td><td>{fmt$(a.myobYtd)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
            : <Empty>No unmapped profit-and-loss accounts on this sync.</Empty>}
          {recon.excluded.length > 0 && (
            <>
              <h3 className="tl-sub">Balance sheet, left off the surplus</h3>
              <div className="table-scroll myob-scroll">
                <table className="ftable">
                  <thead><tr><th>Account</th><th>MYOB YTD</th></tr></thead>
                  <tbody>
                    {recon.excluded.map((a) => (
                      <tr key={a.accountCode}><td><span className="mono">{a.accountCode}</span> {a.name}<span className="hint">{a.reason}</span></td><td>{fmt$(a.myobYtd)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>}
    </>
  );
}
