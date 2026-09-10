# SNSW Dashboards — backend (Next.js + MongoDB)

Lives in `backend/`; the frontend UI lives in `../dashboard/`.

The server side of the SNSW Adventist Education dashboards, built to the plan in `../docs/backend/`. MVC with a service layer:

```
src/
  app/api/v1/…        Controllers' HTTP surface (Next.js route handlers; each is 2–3 lines)
  controllers/        Parse → one service → one presenter
  services/           The maths and the workflow (rollup, reconciliation, status, consolidation,
                      boardDocument, structure, workflow, financeQuery, financeWrite, databoard)
  presenters/         Views: JSON contracts (whole dollars) the React app reads
  models/             Mongoose models (minor units, versioned facts, immutable once approved)
  domain/types.ts     Shared vocabulary
scripts/seed.ts       Loads ../dashboard/data/*.js as version 1 APPROVED per unit + one published week
tests/                Vitest: services reproduce today's frontend to the dollar (no database needed)
```

## Run it

```bash
cp .env.example .env.local        # MONGODB_URI=mongodb://127.0.0.1:27017/snsw_dashboard
npm install
npm run seed:reset                # drop + load the four boards and the databoard
npm run dev                       # http://localhost:3000  (index page lists every endpoint)
npm test                          # service acceptance tests
npm run typecheck
```

## The rule the code enforces

Only raw data is written: line items on a **DRAFT** report version, loans, leases, family debtors, notes, and the databoard's judgement fields. Everything a dashboard shows is calculated on every read from the latest **APPROVED** version: category totals, KPIs, EBIDA, the salary sub-line, the all-schools summary, the databoard's operating result, each school's budget and variance, the Finance light and the Overall light. Approved versions cannot change; a revision is a new version.

## Read paths

| Endpoint | Returns |
|---|---|
| `GET /api/v1/finance/summary` | consolidated totals, per-school rows with finance light, cross-school attention list |
| `GET /api/v1/finance/{unit}/board` | the board document the frontend store expects: computed `income[]` / `expenditure[]`, `details`, `addback`, `priorYear`, `loans`, `leases`, `comments`, `meta`, `reconciliation` |
| `GET /api/v1/finance/{unit}/overview` | KPIs, going well / needs attention, categories, totals, EBIDA, reconciliation, finance light |
| `GET /api/v1/finance/{unit}/line-items` | Details tab only |
| `GET /api/v1/databoard/latest` | raw weekly fields plus derived lights and figures |

Query options on finance reads: `?period=June 2026` and `?versionMode=DRAFT` (editors) or `LATEST_APPROVED` (default).

## Write paths

| Endpoint | Does |
|---|---|
| `PUT /api/v1/finance/{unit}/board` | replaces the draft's line items, page-1 totals, debtors, obligations and notes from a board document; `?publish=true` approves it too (what the current UI's *Save* means) |
| `PATCH /api/v1/finance/{unit}/line-items` | `{ upserts: [{section, group, code, label, budget, …}], deletes: [{code}] }` on the draft |
| `POST /api/v1/finance/{unit}/versions` | `{ period: "July 2026" }` opens a draft copied from the latest approved version |
| `POST …/versions/{id}/submit` · `approve` · `reject` | workflow; approving stores the reconciliation checks and supersedes the old version |
| `POST …/reconciliations/{id}/resolve` | `{ status: "RESOLVED" \| "WAIVED", explanation }` |
| `PUT /api/v1/databoard/{weekEnding}` | raw fields; `?publish=true` |
| `POST /api/v1/imports` → `POST /api/v1/imports/{id}/publish?approve=true` | validate a board document, then turn it into a version (the path the MYOB / Synergetic / Hubworks jobs will use) |
| `POST /api/v1/imports/pdf` (multipart: `file`, `unit`) | read the monthly operating-report PDF into a board document and validate it; returns the parsed board, warnings and notes for a preview, then the same `…/publish` call above makes it a draft or approved version. `?publish=true&approve=true` does it in one step |

## Monthly report PDFs

`src/services/pdfReport.ts` parses the "Financial Performance" report exactly as Excel exports it: page 1 gives the Overview categories, surplus and EBIDA (the add-back is EBIDA − surplus); the landscape pages give every account line under its group. Numbers are found by column right edge (Excel right-aligns them, so blanks are simply absent), and labels that wrap are reassembled from the lines above the account code. The report's title decides which school it is for, and an upload from the wrong school's board is refused. Leases and loans are built from the report's amortisation, interest and lease-payment lines, the way the boards always worded them; family debtors are measured off the bars of the page-1 chart against its axis (good to a few hundred dollars, and said so on the board). Commentary, typed debtors and any loan or lease the report has no line for are kept from the board already held for that period (else the latest approved one). The Capital expenditure chart is ignored: on the August 2026 report its bar disagrees with the table. The parser checks each group's lines against the report's own subtotal; the NCS August 2026 report, for instance, hides its Insurance line but includes it in the Administrative total, which shows up as a warning and then as a reconciliation flag. Fixture and tests: `tests/fixtures/`, `tests/pdfReport.test.ts`.

## Wiring the React frontend

`GET …/board` returns the same document shape as `backend/seed-data/finance-*.js`, so the frontend's `SNSW.store.load` becomes a fetch and `store.save` becomes `PUT …/board?publish=true`. The databoard document likewise maps to `GET/PUT /api/v1/databoard/…`. Categories, sub-lines and lights arrive already computed; the frontend only formats.

## Not yet

Users and roles, the three sync jobs, inter-entity eliminations, obligation schedules, and reports in other layouts than the current Excel export (the ELC's, if it differs). All have a home in the models already.
