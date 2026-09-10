const ROUTES: Array<[string, string, string]> = [
  ["GET", "/api/v1/health", "Service and database status"],
  ["GET", "/api/v1/units", "Reporting units (schools, ELC)"],
  ["GET", "/api/v1/periods", "Fiscal periods"],
  ["GET", "/api/v1/finance/summary", "All-schools summary (computed)"],
  ["GET", "/api/v1/finance/{unit}/board", "Board document (computed categories, raw extras) — ?period=June 2026&versionMode=DRAFT"],
  ["PUT", "/api/v1/finance/{unit}/board?publish=true", "Save a board document to the draft; publish approves it"],
  ["GET", "/api/v1/finance/{unit}/overview", "Overview tab, computed"],
  ["GET | PATCH", "/api/v1/finance/{unit}/line-items", "Details tab; PATCH upserts / deletes lines on the draft"],
  ["GET | POST", "/api/v1/finance/{unit}/versions", "Version history; POST opens a draft for a period"],
  ["POST", "/api/v1/finance/{unit}/versions/{id}/submit | approve | reject", "Workflow"],
  ["GET", "/api/v1/finance/{unit}/reconciliations", "Page-1 vs line-item checks"],
  ["POST", "/api/v1/finance/{unit}/reconciliations/{id}/resolve", "Resolve or waive a stored check"],
  ["GET", "/api/v1/databoard/latest", "Weekly databoard with derived fields"],
  ["GET | PUT", "/api/v1/databoard/{weekEnding}", "Raw fields for a week; ?publish=true"],
  ["POST", "/api/v1/databoard/{weekEnding}/publish", "Publish a week"],
  ["GET | POST", "/api/v1/imports", "Upload a board document for validation"],
  ["GET", "/api/v1/imports/{id}", "Import status and validation"],
  ["POST", "/api/v1/imports/{id}/publish?approve=true", "Turn an import into a version"],
];

export default function Home() {
  return (
    <main style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: 22 }}>SNSW Dashboards — API v1</h1>
      <p style={{ color: "#5f6b7a" }}>Backend for the finance boards and the weekly education databoard. Responses are <code>{"{ data: … }"}</code> or <code>{"{ error, details }"}</code>.</p>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
        <tbody>
          {ROUTES.map(([m, p, d]) => (
            <tr key={p} style={{ borderBottom: "1px solid #dce1e7" }}>
              <td style={{ padding: "6px 8px", fontFamily: "monospace", whiteSpace: "nowrap" }}>{m}</td>
              <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{p}</td>
              <td style={{ padding: "6px 8px", color: "#5f6b7a" }}>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
