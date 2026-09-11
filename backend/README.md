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
scripts/seed.ts       Loads seed-data/*.js as version 1 APPROVED per unit + one published week
tests/                Vitest, no database needed (the suite that asserts real figures ships with the data)
```

## Run it

```bash
cp .env.example .env.local        # MONGODB_URI=mongodb://127.0.0.1:27017/snsw_dashboard
npm install
npm run dev                       # http://localhost:3000  (index page lists every endpoint)
npm test                          # service tests
npm run typecheck
```

## Portal SSO & access control (off by default)

The app is an SSO consumer of the Adventist Portal (`login-adventistbot`), following the
fleet's genericOAuth pattern. With `AUTH_SSO_ENABLED` unset the app runs open, exactly as
before. With it on (see `.env.example` for the full variable set):

- Better Auth is mounted at `/api/auth/*` (`src/lib/auth.ts`) with the `enterprise-sso`
  generic-oauth provider (PKCE, portal discovery URL). Sign-in is SSO-only; the callback
  creates the local shadow user on first arrival. Pinned to `better-auth@1.6.29` exactly —
  1.7.x drops `auth.api.signInWithOAuth2`, which the probe depends on.
- `/api/sso/probe` is the portal-launcher handoff (silent `prompt=none` sign-in;
  `?silent=0` for the login page's explicit button). `/api/sso/config` tells the SPA
  whether SSO is on.
- **Authorization is the portal's, not ours**: every `/api/v1` route runs through
  `guarded(permission)` (`src/lib/access.ts`), which requires a session and then asks the
  portal's HMAC-signed `/internal/app-access` endpoint for the user's roles/permissions in
  the bound organization. Fails closed on outage. Vocabulary: `boards.read`, `boards.edit`,
  `boards.publish`, `imports.write` — mirrored in the portal manifest
  (`login-adventistbot/backend/src/apps.ts`, slug `education-dashboard`, roles
  admin / editor / viewer).
- Local dev alongside the IdP: the IdP frontend owns :3000, so run this backend on another
  port (`npx next dev -p 3010`) and start the dashboard with
  `API_PROXY_TARGET=http://localhost:3010`. `BETTER_AUTH_URL` is the BROWSER origin
  (the Vite host, e.g. `http://localhost:5173`) — the SPA proxy makes `/api` same-origin.

Fill the database one of two ways. Restore the `mongosh` snapshot from the data handover:

```bash
mongosh "mongodb://127.0.0.1:27017/snsw_dashboard" snsw-dashboard-snapshot.js
```

Or, if you have the board files, drop them into `seed-data/` and seed:

```bash
npm run seed:reset                # drop + load the four boards and the databoard
```

## What is not in this repository

The four finance boards, the weekly databoard, the original HTML boards and the operating-report
PDF all carry real school figures, so they are handed over privately. Held back with them: the
acceptance suite that checks the roll-up, reconciliation and consolidation to the dollar, and the
PDF parser test. Restoring the handover puts each file back where it belongs and the full suite
runs. Without it `npm run seed` stops with a message, and `npm test` runs the data-free tests.

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

Query options on finance reads (board, overview, summary, line items, reconciliations) and on `databoard/latest`: `?period=June 2026` pins one month; `?from=January 2026&to=June 2026` bounds a range (either end optional) and the newest board inside it is the one returned; nothing set means each unit's newest approved board. `?versionMode=DRAFT` (editors) or `LATEST_APPROVED` (default). A month with no board is a 404, not an empty board. For the databoard the period picks the newest weekly board whose week ended on or before the period's end, and its finance figures follow the same period.

| Read | Returns |
|---|---|
| `GET /api/v1/periods` | every fiscal month, with the units holding an approved board (`approved`) or an open draft (`drafts`) in it — what the period picker lists |
| `GET /api/v1/finance/timeline?from&to[&unit]` | month by month inside the range (or everything): each month's boards and combined totals, oldest first |

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

`src/services/pdfReport.ts` parses the "Financial Performance" report exactly as Excel exports it: page 1 gives the Overview categories, surplus and EBIDA (the add-back is EBIDA − surplus); the landscape pages give every account line under its group. Numbers are found by column right edge (Excel right-aligns them, so blanks are simply absent), and labels that wrap are reassembled from the lines above the account code. The report's title decides which school it is for, and an upload from the wrong school's board is refused. Leases and loans are built from the report's amortisation, interest and lease-payment lines, the way the boards always worded them; family debtors are measured off the bars of the page-1 chart against its axis (good to a few hundred dollars, and said so on the board). Commentary, typed debtors and any loan or lease the report has no line for are kept from the board already held for that period (else the latest approved one). The Capital expenditure chart is ignored: on the August 2026 report its bar disagrees with the table. The parser checks each group's lines against the report's own subtotal; the NCS August 2026 report, for instance, hides its Insurance line but includes it in the Administrative total, which shows up as a warning and then as a reconciliation flag. Fixture and tests: `tests/fixtures/` and `tests/pdfReport.test.ts`, both in the data handover.

## Wiring the React frontend

`GET …/board` returns the same document shape as `backend/seed-data/finance-*.js`, so the frontend's `SNSW.store.load` becomes a fetch and `store.save` becomes `PUT …/board?publish=true`. The databoard document likewise maps to `GET/PUT /api/v1/databoard/…`. Categories, sub-lines and lights arrive already computed; the frontend only formats.

## Not yet

Users and roles, the three sync jobs, inter-entity eliminations, obligation schedules, and reports in other layouts than the current Excel export (the ELC's, if it differs). All have a home in the models already.
