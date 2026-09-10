# SNSW Dashboards — frontend UI (React)

Vite + React 19 + TypeScript. Reads and writes through the backend in `../backend` (Next.js API on port 3000). Styled from the tokens in `../brand-kit.html`.

```bash
npm install
npm run dev        # http://localhost:5173  (proxies /api → http://localhost:3000)
npm run build      # typecheck + production bundle in dist/
```

The backend must be running and seeded first (`cd ../backend && npm run seed:reset && npm run dev`).

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
  styles/tokens.css          brand-kit tokens (light, system-dark, forced-dark)
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

## Brand kit, applied

- SNSW blue is the only interactive accent; gold appears once per screen (the feature tile's companion series, the "add" button in edit mode).
- Green, amber and red are used for status only: traffic lights, chips, variance colours.
- Cards and chrome are one layer of translucent glass over the brand-tinted backdrop; dense tables use the stronger glass; the sidebar is the single dark surface in both themes.
- Inter throughout, IBM Plex Mono for account codes, tabular numerals in every figure column.
- Light, system-dark and forced-dark themes; the toggle lives in the sidebar foot.
