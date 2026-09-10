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

## Wiring the React frontend

`GET …/board` returns the same document shape as `backend/seed-data/finance-*.js`, so the frontend's `SNSW.store.load` becomes a fetch and `store.save` becomes `PUT …/board?publish=true`. The databoard document likewise maps to `GET/PUT /api/v1/databoard/…`. Categories, sub-lines and lights arrive already computed; the frontend only formats.

## Not yet

Users and roles, file parsing for uploaded workbooks, the three sync jobs, inter-entity eliminations, obligation schedules. All have a home in the models already.
