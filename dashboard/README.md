# SNSW Dashboards — frontend UI (React)

Vite + React 19 + TypeScript. Reads and writes through the backend in `../backend` (Next.js API on port 3000). Styled to the CFO Command Centre system (see `../DESIGN.md`), so the education and CFO dashboards read as one family.

```bash
npm install
npm run dev        # http://localhost:5173  (proxies /api → http://localhost:3000)
npm run build      # typecheck + production bundle in dist/
```

The backend must be running and seeded first (`cd ../backend && npm run seed:reset && npm run dev`).

## Portal sign-in

When the backend runs with `AUTH_SSO_ENABLED=true` (see `../backend/README.md`), the app is a
portal tool: signed-out visitors get a sign-in screen ("Sign in with Adventist Portal"), the
portal launcher's tile deep-links through `/api/sso/probe` for a silent handoff, and
`GET /api/v1/me` drives everything — 401 shows the login screen, 403 the "no access yet"
screen, and the returned `permissions` decide which editing affordances render
(`boards.edit` = pencils and Edit board, `boards.publish` = publish buttons,
`imports.write` = Upload report PDF). The sidebar foot carries the signed-in user, sign-out,
and the way back to the portal's app launcher. Without SSO the app runs open in
"Local mode", as before.

## Screens

| Route | Screen | Source |
|---|---|---|
| `/databoard` | Weekly education databoard | `GET /api/v1/databoard/latest` |
| `/finance` | All-schools finance summary | `GET /api/v1/finance/summary` |
| `/finance/:unit` | School finance board — Overview | `GET …/board` + `GET …/overview` |
| `/finance/:unit/details` | School finance board — Details | same board document |

## Editing

Edit board opens a copy of the document. Only raw data is typeable: line items on Details (values, codes, names, add and remove), the period, loans and leases, family debtors and notes; on the databoard the cash, loan and reserve tiles, building, staffing and enrolment details, the four judgement lights with their notes, risks, WHS items and wins. Everything else is shown as calculated by the server.

*Save draft* writes a DRAFT version (`PUT …/board`); *Save & publish* approves it in the same call (`?publish=true`). The summary and the databoard refetch after either.

## Layout

```
src/
  main.tsx, App.tsx          providers and routes
  styles/tokens.css          CFO-system tokens (light, system-dark, forced-dark)
  styles/app.css             components built from the tokens
  lib/api.ts, types.ts       typed client and API shapes
  lib/format.ts, editing.ts  number formatting; immutable edit helpers
  hooks/queries.ts           TanStack Query hooks and mutations
  components/ui.tsx          Card, Kpi, Chip, TrafficLight, Button, inputs, toasts, search
  components/charts.tsx      PairedBars, Sparkline
  components/layout/         Shell (sidebar, top bar), PageHeader
  pages/                     DataboardPage, SummaryPage, FinanceBoardPage
  features/finance/          OverviewTab, DetailsTab
```

## Design system, applied

- The CFO Command Centre look: warm paper ground, flat white cards with hairline borders, light neutral sidebar; the translucent top bar is the one blur in the app.
- Bronze/gold is the accent family (links, active states, the budget series); primary actions and the primary chart series are ink.
- Green, amber and red are used for status only: traffic lights, chips, variance colours.
- Poppins (300–600) throughout — large figures at weight 300 — with IBM Plex Mono for account codes and tabular numerals in every figure column.
- Light, system-dark and forced-dark themes; the toggle lives in the sidebar foot. The CFO app defines only light, so the dark ramp is owned here (same hues, lifted for contrast).
