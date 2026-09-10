# SNSW Adventist Education — Dashboards

Two major folders:

| Folder | What it is | Run |
|---|---|---|
| `dashboard/` | the frontend UI — React 19 + Vite, styled from `brand-kit.html`, see `dashboard/README.md` | `cd dashboard && npm install && npm run dev` → <http://localhost:5173> |
| `backend/` | Next.js + MongoDB API (MVC with a service layer), see `backend/README.md` | `cd backend && npm install && npm run seed:reset && npm run dev` → <http://localhost:3000> |

Supporting material sits in `docs/`: the backend plan and schema (`docs/backend/`), the original stand-alone HTML boards (`docs/source-boards/`), the phase-1 static consolidation (`docs/legacy-static-dashboard/`, superseded by the React app) and the initial brief. `brand-kit.html` at the root is the design reference.

The dashboard brings the five stand-alone HTML boards together and lets you switch between them:

| Board | Route | Source file |
|---|---|---|
| Weekly Education Databoard | `#/databoard` | `snsw_databoard (6).html` |
| Finance summary — all schools | `#/finance` | *new — computed from the four boards below* |
| Border Christian College — Finance | `#/finance/bcc` | `bcc-finance-dashboard (2).html` |
| Narromine Christian School — Finance | `#/finance/ncs` | `ncs-finance-dashboard (2).html` |
| Canberra Christian School — Finance | `#/finance/ccs` | `ccs-finance-dashboard (2).html` |
| Canberra Christian ELC — Finance | `#/finance/ccs-elc` | `ccs-elc-finance-dashboard (1).html` |

The original HTML files are kept untouched in `docs/source-boards/` for reference.

## Running it

1. Start MongoDB, then `cd backend && npm install && npm run seed:reset && npm run dev` (API on :3000).
2. `cd dashboard && npm install && npm run dev` (UI on :5173, proxying `/api` to the backend).

## The rule

Only raw data is typed: line items on a school's Details tab, loans and leases, family debtors and notes, and the databoard's judgement fields. Everything a card shows is calculated by the backend from the latest approved version of those line items. Edits are saved as a draft or published as a new approved version; approved versions never change.

## Backend

Built in `backend/` (Next.js route handlers, Mongoose on local MongoDB, no users yet). It stores line items as versioned facts and calculates everything else on the server; see `backend/README.md` and `docs/backend/README.md`. Next steps: port `dashboard/` to React inside the same project and read/write through the API; then the MYOB, Synergetic and Hubworks feeds via the import pipeline.
