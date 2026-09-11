# Design

Visual system for the SNSW Education Dashboard. Ported from the CFO Command
Centre (`D:\adventist-apps\CFODashboard\frontend`) so both apps read as one
family. Values live as CSS custom properties in `dashboard/src/styles/tokens.css`.

## Theme

Warm paper, flat surfaces, no glass. Light is the primary theme; dark is a
derived counterpart using the same hues (the CFO app defines only light, so the
dark ramp is owned here).

## Color

### Light (primary)

| Role | Token | Value |
|---|---|---|
| Page ground | `--bg` | `#FAFAF8` |
| Card surface | `--surface` | `#FFFFFF` |
| Second neutral (sidebar, panels) | `--surface-2` | `#F5F4EF` |
| Ink (headings, figures) | `--ink` | `#1B2430` |
| Body/muted text | `--muted` | `#5B626C` |
| Faint text (axis, meta) | `--faint` | `#9AA0A8` |
| Hairline | `--line` | `#E7E5DF` |
| Strong hairline | `--line-strong` | `#D9D6CE` |
| Accent (links, active, focus) | `--accent` | `#8A6A2A` bronze |
| Accent hover | `--accent-dark` | `#6B5320` |
| Accent tint | `--accent-soft` | `#F7F1E6` |
| Gold (comparison series, marker) | `--gold` | `#C9A24B` |
| Good | `--green` / tint | `#3E7A55` / `#EEF3EF` |
| Watch | `--amber` / tint | `#C9A24B`, text `#8A6A2A` / `#F7F1E6` |
| Bad | `--red` / tint | `#A8443B` / `#F7ECEA` |
| Primary action | `--primary` on `--primary-text` | `#1B2430` on `#FBFBF9` |

Neutral status colour: `#41566C`; neutral tint `#F1EFEA`. Hover wash `#EFEDE7`.

### Dark (derived)

Same hues, lifted for contrast: ground `#14171C`, surface `#1C2027`,
surface-2 `#232830`, ink `#ECEAE3`, lines `#2E333C`/`#3D434E`, bronze
`#D3B36A`, green `#6FAF8B`, red `#CF837A`. Primary action inverts to paper on
ink. Tints are 14–18% alpha of the hue.

## Typography

- Family: **Poppins** (300, 400, 500, 600) for all UI and figures;
  IBM Plex Mono only for account codes.
- Page title: 27px, weight 300, letter-spacing −0.01em.
- KPI figure: ~28px, weight 300, `tabular-nums`.
- Eyebrow over titles: 10px, uppercase, letter-spacing .14em, `#A0885E`, w500.
- Section titles: 10px uppercase, letter-spacing .12em, `--faint`, w500.
- Body/labels 12.5–14px w400; emphasis w500; strong figures w600.
- Never exceed weight 600 — the old 700/800 grades are retired.

## Components

- **Cards**: flat `--surface`, 1px `--line`, radius 12, no shadow. Elevation
  (dropdowns, modals) uses `0 12px 32px rgba(27,36,48,.12)` and
  `0 22px 48px rgba(27,36,48,.16)`.
- **Sidebar**: 250px-ish, `--surface-2`, right hairline; group labels tiny
  uppercase `#A8A196`; active item = ink pill, paper text, 5px gold dot.
- **Header/topbar**: translucent paper `rgba(250,250,248,.92)` + 8px blur, the
  one blur in the app.
- **Buttons**: primary = ink pill/8px radius; ghost = white with `--line`
  border; hover wash `#EFEDE7`.
- **Status chips**: tint background + hue text, tiny uppercase, leading dot.
- **Charts**: primary series ink, comparison gold, positive green; grid lines
  `#EFEDE7`; axis text 9px `--faint`.
- **Inputs**: white, 1px `--line`, radius 8–9, focus = border to `--ink`
  (no glow).

## Motion

150–250ms state transitions only; `cc-spin`-style spinners for busy state;
no page-load choreography. `prefers-reduced-motion` disables all.

## Board reading hierarchy

The weekly and finance boards now use scoped styles in `dashboard.css` and
`finance.css` to give data more space. Cards use neutral surfaces, 24px padding,
and 20px gaps. Internal horizontal rules are replaced by spacing and subtle
alternating table rows. Group totals remain distinct with a neutral fill.

Finance KPIs use plain figures; color is reserved for exceptions. School-level
income, spending, and surplus show their variance immediately below the amount.
Tables retain all figures, right-aligned tabular numerals, and horizontal
scrolling on narrow screens. Search filters visible accounts; totals still
include all accounts.

Secondary page actions live in an Actions disclosure. Present mode removes
navigation and retains authorized editing. Editing controls and save actions
appear in context. Placeholder, mixed-period, and reconciliation notices remain
visible. Read-only permissions and calculated fields are unchanged.

Charts reveal their marks once on entering view, while numeric labels remain
visible. Signed bar charts share a zero baseline and show deficits to its left.
Weekly status circles use the requested repeating outward glow. Reduced-motion
and print styles remove animation.
