# SNSW Dashboards — Backend Blueprint (MVC)

Status: **built (phase 1) in `../../backend/`** on Next.js + MongoDB (Mongoose) rather than the PostgreSQL reference stack below — same models, services, presenters and API, with the immutability of approved versions enforced in the workflow service instead of a database trigger. `schema.sql` remains as the relational reference. The frontend is not yet wired to it.

Companion files:

- `schema.sql` — the phase-1 PostgreSQL schema (the contract every layer is written against)
- `backend-plan.html` — the diagram page (layers, request flows, entity model)

## 1. The one rule

> Store source facts at the lowest trustworthy grain. Calculate everything else.

A dashboard number is never typed. It is derived from line items and can always be traced back to **unit → period → report version → account → scenario → amount**. The frontend already works this way (line items on the Details tab drive every card). The backend makes that rule enforceable: only raw-data endpoints accept writes; every dashboard endpoint is read-only and computed on the server.

## 2. Where the Perplexity model was adopted, trimmed or extended

The Perplexity answer (`to give more context, these are the data that we a.pdf`, in Downloads) is a sound multi-entity financial reporting model. Decisions:

| Perplexity proposal | Decision | Why |
|---|---|---|
| Facts at grain (entity, period, account, scenario, period basis), money in integer minor units | **Adopt** | Exactly what the operating reports contain; matches the frontend's line-item rule |
| Versioned report snapshots, never overwrite an approved version | **Adopt** | Revised June reports happen; history must explain old exports |
| Declared page-1 totals kept separately + reconciliation checks | **Adopt** | We already found four real page-1 vs detail mismatches in the source files |
| Effective-dated account → reporting-group mappings | **Adopt** | Group definitions change between years |
| `metric_definitions` for EBIDA add-back and similar formulas | **Adopt, widen** | Also holds the salary sub-line codes and the traffic-light thresholds, so no formula is hard-coded |
| Import batches / rows / source account mappings | **Adopt** | Same tables serve manual uploads and the MYOB / Synergetic / Hubworks syncs |
| Separate `legal_entities` table | **Defer** | One conference entity today; a `legal_entity` column on operating units is enough until the ELC needs its own ABN reporting |
| `budget_versions` / `forecast_versions` tables | **Defer** | The operating report already supplies budget, annual budget and EOY estimate as facts (`scenario` × `period_basis`). Authoring budgets in the platform is phase 3 |
| Fund / cost-centre / program / project dimensions on every fact | **Defer** | Not present in any source report; adds nullable columns to the unique key for no current benefit |
| Inter-entity elimination rules | **Defer, flag** | Internal management fees (account 2955) exist, so accounts carry `is_intercompany`; elimination runs are phase 2 |
| Full receivables subledger (invoices, receipts, ageing) | **Defer** | Synergetic owns billing; we import debtor snapshots |
| Weekly education databoard (health matrix, cash, snapshots, risks, WHS, wins) | **Missing → added** | Half of the product; needs its own models |
| Source systems and sync jobs | **Missing → added** | The brief's phase 2 target is live MYOB / Synergetic / Hubworks data |
| Users, roles, per-unit access, audit | **Missing → added** | Principals see their school; finance edits; board reads all |

## 3. Architecture (MVC with a service layer)

```
                 ┌──────────────── HTTP / JSON ────────────────┐
  Browser app ───┤  Controllers  (routing, auth, validation)   │
  (app/)         │      │                                       │
                 │      ▼                                       │
                 │  Services     (roll-up, variance, EBIDA,     │
                 │               reconciliation, consolidation, │
                 │               status, import pipeline)       │
                 │      │                                       │
                 │      ▼                                       │
                 │  Models       (entities + repositories)      │
                 │      │                                       │
                 │  Views        (presenters → JSON contracts)  │
                 └──────┼────────────────────────────────────────┘
                        ▼
                   PostgreSQL          Jobs: MYOB · Synergetic · Hubworks sync
```

- **Models** — one entity per table in `schema.sql`, plus repositories that own all SQL. No calculation here beyond invariants (sign, currency, uniqueness).
- **Services** — the maths, as pure functions over model data so they can be unit-tested against the four existing boards: `RollupService`, `VarianceService`, `MetricService` (EBIDA, margin, salary sub-line), `ReconciliationService`, `ConsolidationService`, `StatusService` (finance light, overall = worst-of), `ImportService`, `SyncService`.
- **Views** — presenters that shape service output into the JSON the frontend already understands (`income[]`, `expenditure[]`, `details`, `addback`, `priorYear`, `loans`, `leases`, `comments`, `meta`, plus the databoard document). Wiring the frontend later means swapping `SNSW.store.load/save` for fetch calls; the view contract is the current data shape.
- **Controllers** — thin: authenticate, validate, call one service, hand the result to one presenter.

Reference stack (assumption, easy to swap): Node 20 + TypeScript, Express, `pg` with SQL migrations (`node-pg-migrate`), Zod for request validation, Vitest for the service tests, PostgreSQL 16. The schema is the contract, so Laravel or Django would fit the same design.

### Write paths vs read paths

| Accepts writes (raw data) | Read-only (calculated) |
|---|---|
| line items on a DRAFT report version | overview, KPIs, charts, category totals, salary sub-line, EBIDA |
| obligations (loans / leases), receivables snapshots | all-schools summary |
| commentary notes | reconciliation checks |
| databoard: cash items, unit snapshots, four judgement lights + notes, risks, WHS, wins | databoard: operating result, school budget / variance, Finance and Overall lights |
| account mappings, metric definitions (admin, versioned) | consolidated figures |

### Report version workflow

`DRAFT → IN_REVIEW → APPROVED → SUPERSEDED`. Dashboards read the latest APPROVED version by default; finance editors can view their draft. Approving a version runs the reconciliation checks and stores their results; failed checks do not block approval but surface as the data-quality card.

## 4. Model catalogue (phase 1)

| Group | Tables | Notes |
|---|---|---|
| Organisation & access | `organisations`, `operating_units`, `users`, `roles`, `user_unit_access`, `audit_events` | unit types SCHOOL / ELC / CONFERENCE; `colour`, `short_name` feed the UI registry |
| Calendar | `fiscal_years`, `fiscal_periods` | period status OPEN / SOFT_CLOSED / HARD_CLOSED |
| Chart & reporting structure | `accounts`, `reporting_groups`, `account_group_mappings`, `metric_definitions` | mappings and metrics are effective-dated |
| Sources & versions | `source_systems`, `source_connections`, `import_batches`, `import_rows`, `source_account_mappings`, `reporting_snapshots`, `report_versions` | one batch per upload or sync run |
| Facts | `financial_facts`, `reported_totals`, `reconciliation_checks`, `receivables_snapshots`, `financial_obligations`, `obligation_schedule_lines`, `commentary_notes` | facts unique on (version, unit, period, account, scenario, basis) |
| Weekly databoard | `weekly_boards`, `board_health_ratings`, `cash_position_items`, `unit_snapshots`, `enrolment_census`, `board_items` | derived lights and figures are not stored |

## 5. API surface (v1)

All reporting endpoints take explicit context: `unitId` (or `unitIds`), `periodId`, `versionMode=LATEST_APPROVED|DRAFT`.

```
GET   /api/v1/units                              registry (id, name, short, colour, type)
GET   /api/v1/periods                            fiscal years and periods

GET   /api/v1/finance/summary                    all-schools summary (computed)
GET   /api/v1/finance/:unit/overview             KPIs, categories, charts, recon (computed)
GET   /api/v1/finance/:unit/line-items           details tab, by version
PATCH /api/v1/finance/:unit/line-items           batch upsert/delete on the DRAFT version
POST  /api/v1/finance/:unit/versions             open a new draft from latest approved
POST  /api/v1/finance/:unit/versions/:id/submit
POST  /api/v1/finance/:unit/versions/:id/approve

GET   /api/v1/finance/:unit/reconciliations      checks for a version
POST  /api/v1/finance/:unit/reconciliations/:id/resolve
GET|POST|PATCH|DELETE /api/v1/finance/:unit/obligations
GET|POST|PATCH|DELETE /api/v1/finance/:unit/notes
PUT   /api/v1/finance/:unit/receivables          this-year / prior-year debtor snapshot

GET   /api/v1/databoard/latest                   published board, computed document
GET   /api/v1/databoard/:weekEnding
PUT   /api/v1/databoard/:weekEnding              raw fields only
POST  /api/v1/databoard/:weekEnding/publish

POST  /api/v1/imports                            upload operating report (xlsx/csv/pdf-extract)
GET   /api/v1/imports/:id                        preview, validation, mapping gaps
POST  /api/v1/imports/:id/publish                creates a report version (DRAFT)

POST  /api/v1/auth/login · GET /api/v1/auth/me   (SSO later)
```

## 6. Integrations (phase 2 jobs, same tables)

| Source | What we pull | Lands in |
|---|---|---|
| MYOB Business API | `AccountRegister` (monthly GL movement by account) and `AccountBudget` (monthly budgets) | `import_batches` → `financial_facts` scenario ACTUAL / BUDGET; account codes mapped through `source_account_mappings` |
| Synergetic (Education Horizons REST API) | enrolment counts by census date; family debtor balances | `enrolment_census`, `receivables_snapshots` |
| Hubworks (API or SFTP export) | ELC occupancy / attendance, CCS estimates | `enrolment_census` (headcount + occupancy %), facts for CCS income where exported |
| Manual upload | operating report workbook | `import_batches` → `financial_facts` + `reported_totals` |

Every sync creates an import batch and a DRAFT report version; nothing published changes without approval. Amortisation rules the finance team describes go into `metric_definitions` (`formula_type = SCHEDULE`) and are applied by `MetricService`, not hand-typed.

## 7. Data rules enforced in the database

- money as `bigint` minor units with a currency code; no floats
- natural signs: discounts and reversals negative, expenses positive
- facts unique per (version, unit, period, account, scenario, basis)
- approved versions are immutable (trigger rejects updates to their facts)
- every record belongs to one organisation; cross-organisation references rejected
- every change to facts, mappings, metrics, versions and databoards is written to `audit_events`

## 8. Build order

1. Schema + migrations + seed (four units, FY2026, chart of accounts and groups from the four boards, metric definitions for EBIDA and salaries).
2. Importer that loads the existing `backend/seed-data/finance-*.js` files as version 1 APPROVED for each unit — the backend then reproduces today's dashboard exactly, which is the acceptance test.
3. Services with unit tests against those four boards (roll-up, variance, EBIDA, reconciliation must match the frontend's numbers to the dollar).
4. Read endpoints + presenters, then write endpoints + workflow, then auth and audit.
5. Frontend wiring: replace `SNSW.store` with the API client.
6. Phase 2: MYOB, Synergetic, Hubworks sync jobs.
