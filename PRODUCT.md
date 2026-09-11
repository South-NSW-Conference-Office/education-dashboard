# Product

## Register

product

## Users

South NSW Conference office staff — the CFO, the education director, and school
business managers. They open the dashboard at a desk, usually mid-task (board
prep, monthly reporting, a school phone call), to read the financial and
operational position of the conference's four education units: Border Christian
College, Narromine Christian School, Canberra Christian School and its ELC.
Boards and figures are edited inline by a small number of trusted staff; most
sessions are read-only.

## Product Purpose

One place to read and maintain the education boards: the weekly databoard
(traffic-light status across all sites), each school's finance board (overview,
line-item details, timeline), and the consolidated all-schools summary. It
replaces five stand-alone HTML boards. Success is a treasurer trusting the
figures at a glance and an assistant updating a board without touching a
spreadsheet.

## Brand Personality

Calm, institutional, exact. It belongs to the same family as the SNSW CFO
Command Centre and should read as a sibling surface: warm paper ground, navy
ink, restrained gold. Numbers are the loudest thing on any page.

## Anti-references

- Generic SaaS admin templates: cool blue-grey, heavy shadows, gradient KPIs.
- Glassmorphism: frosted layers, background blobs, translucent cards. (The
  previous education theme; deliberately retired in favour of the CFO system.)
- Consumer-app playfulness — this is a finance instrument for a conference
  office.

## Design Principles

1. **Sibling of the CFO Command Centre.** The CFO dashboard's visual system
   (`CFODashboard/frontend`) is the source of truth: its palette, Poppins type,
   flat white cards on warm paper, and light sidebar. Deviations need a reason.
2. **Numbers first.** Large light-weight figures, tabular-nums everywhere,
   colour only as status (green good / bronze watch / red bad).
3. **Quiet chrome, dense content.** Chrome (sidebar, header) stays neutral and
   flat; density lives in tables and boards where the work happens.
4. **Editing is invisible until summoned.** Pencils on hover/focus, a sticky
   save bar only when a draft exists — the read view stays a clean report.

## Accessibility & Inclusion

WCAG 2.1 AA intent: body text ≥4.5:1 on its surface, status never conveyed by
colour alone (dots/chips carry labels or titles), keyboard access to all
editing affordances, `prefers-reduced-motion` respected. Dark theme is kept as
a first-class equal of the light theme.
