-- SNSW Dashboards — phase-1 backend schema (PostgreSQL 16)
-- Status: proposed. This file is the contract the Models layer is written against.
-- Conventions: uuid keys, money as bigint minor units + currency, natural signs,
-- every row scoped to one organisation, approved report versions immutable.

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. Organisation & access
-- ============================================================
create table organisations (
  id            uuid primary key default gen_random_uuid(),
  code          varchar(30) not null unique,           -- 'SNSW'
  name          text not null,
  currency_code char(3) not null default 'AUD',
  timezone      text not null default 'Australia/Sydney',
  created_at    timestamptz not null default now()
);

create table operating_units (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references organisations(id),
  parent_unit_id   uuid null references operating_units(id),
  code             varchar(30) not null,               -- 'bcc', 'ncs', 'ccs', 'ccs-elc'
  name             text not null,
  short_name       varchar(20) not null,
  unit_type        varchar(20) not null check (unit_type in ('CONFERENCE','SCHOOL','EARLY_LEARNING_CENTRE','CAMPUS','DEPARTMENT')),
  legal_entity     text null,                          -- split into its own table if the ELC needs separate reporting
  location         text null,
  colour_hex       char(7) null,
  reporting_enabled boolean not null default true,
  is_active        boolean not null default true,
  valid_from       date null,
  valid_to         date null,
  unique (organisation_id, code)
);

create table roles (
  code        varchar(20) primary key,                 -- ADMIN, FINANCE, PRINCIPAL, BOARD
  description text not null
);

create table users (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  email           text not null unique,
  display_name    text not null,
  role_code       varchar(20) not null references roles(code),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Principals see their own unit(s); FINANCE/BOARD/ADMIN see all units of the organisation.
create table user_unit_access (
  user_id           uuid not null references users(id),
  operating_unit_id uuid not null references operating_units(id),
  can_edit          boolean not null default false,
  primary key (user_id, operating_unit_id)
);

create table audit_events (
  id              bigserial primary key,
  organisation_id uuid not null references organisations(id),
  actor_user_id   uuid null references users(id),
  occurred_at     timestamptz not null default now(),
  entity_table    varchar(60) not null,
  entity_id       text not null,
  action          varchar(20) not null,                -- INSERT, UPDATE, DELETE, APPROVE, PUBLISH, SYNC
  before_json     jsonb null,
  after_json      jsonb null,
  reason          text null
);

-- ============================================================
-- 2. Calendar
-- ============================================================
create table fiscal_years (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  code            varchar(20) not null,                -- 'FY2026'
  starts_on       date not null,
  ends_on         date not null,
  status          varchar(20) not null default 'OPEN' check (status in ('OPEN','SOFT_CLOSED','HARD_CLOSED')),
  unique (organisation_id, code),
  check (starts_on <= ends_on)
);

create table fiscal_periods (
  id             uuid primary key default gen_random_uuid(),
  fiscal_year_id uuid not null references fiscal_years(id),
  period_no      smallint not null,                    -- 1..12
  label          varchar(50) not null,                 -- 'June 2026'
  starts_on      date not null,
  ends_on        date not null,
  status         varchar(20) not null default 'OPEN' check (status in ('OPEN','SOFT_CLOSED','HARD_CLOSED')),
  unique (fiscal_year_id, period_no),
  check (starts_on <= ends_on)
);

-- ============================================================
-- 3. Chart of accounts & reporting structure
-- ============================================================
create table accounts (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  code            varchar(30) not null,                -- '1030'
  name            text not null,                       -- 'Salaries - Teachers'
  account_class   varchar(30) not null check (account_class in ('REVENUE','EXPENSE','CAPITAL_INCOME','CAPITAL_EXPENDITURE','ASSET','LIABILITY','EQUITY','MEMO')),
  normal_balance  varchar(6)  not null check (normal_balance in ('DEBIT','CREDIT')),
  is_intercompany boolean not null default false,      -- e.g. 2955 internal management fees
  is_active       boolean not null default true,
  valid_from      date null,
  valid_to        date null,
  unique (organisation_id, code)
);

create table reporting_groups (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  code            varchar(50) not null,                -- 'STUDENT_TUITION'
  name            text not null,                       -- 'Student tuition'
  section         varchar(20) not null check (section in ('INCOME','EXPENDITURE','CAPITAL')),
  parent_group_id uuid null references reporting_groups(id),
  display_order   integer not null,
  is_active       boolean not null default true,
  unique (organisation_id, code)
);

-- Which reporting group an account rolls into, and from when. Never edit history; add a new row.
create table account_group_mappings (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references accounts(id),
  reporting_group_id uuid not null references reporting_groups(id),
  valid_from         date not null,
  valid_to           date null,
  unique (account_id, valid_from)
);

-- Formulas the dashboard needs, stored as data so nothing is hard-coded:
--   EBIDA_ADDBACK   {"account_codes":["2640","2720","2725","2740","2750"]}          (interest, depreciation, amortisation)
--   SALARY_SUBLINE  {"group_code":"TUITION_EXPENSES","account_codes":["1030","1041","1210","1330"]}
--   FINANCE_LIGHT   {"amber_within_pct":5}
--   LEASE_AMORTISATION {"schedule":"STRAIGHT_LINE", ...}    (phase 2, per finance team)
create table metric_definitions (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  code            varchar(50) not null,
  name            text not null,
  formula_type    varchar(30) not null,
  definition_json jsonb not null,
  effective_from  date not null,
  effective_to    date null,
  approved_by     uuid null references users(id),
  unique (organisation_id, code, effective_from)
);

-- ============================================================
-- 4. Sources, imports and report versions
-- ============================================================
create table source_systems (
  code        varchar(20) primary key,                 -- MANUAL, MYOB, SYNERGETIC, HUBWORKS
  name        text not null
);

create table source_connections (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references organisations(id),
  operating_unit_id  uuid null references operating_units(id),   -- null = organisation-wide
  source_system_code varchar(20) not null references source_systems(code),
  credentials_ref    text null,                        -- secret-store key, never the secret
  schedule_cron      varchar(50) null,
  last_synced_at     timestamptz null,
  last_status        varchar(20) null,
  is_active          boolean not null default true
);

create table import_batches (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references organisations(id),
  source_system_code varchar(20) not null references source_systems(code),
  source_connection_id uuid null references source_connections(id),
  file_name          text null,
  file_checksum      varchar(64) null,
  imported_by        uuid null references users(id),
  imported_at        timestamptz not null default now(),
  status             varchar(20) not null default 'RECEIVED' check (status in ('RECEIVED','PARSED','VALIDATED','PUBLISHED','FAILED','REJECTED')),
  error_summary      jsonb null
);

create table import_rows (
  id                 uuid primary key default gen_random_uuid(),
  import_batch_id    uuid not null references import_batches(id),
  row_no             integer not null,
  sheet_name         text null,
  source_code        varchar(50) null,
  source_label       text null,
  raw_payload        jsonb not null,                   -- exactly what arrived
  normalised_payload jsonb null,
  validation_status  varchar(20) not null default 'PENDING',
  validation_errors  jsonb null
);

-- Source account code → canonical account, effective-dated (MYOB codes differ from the report codes).
create table source_account_mappings (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references organisations(id),
  source_system_code  varchar(20) not null references source_systems(code),
  source_account_code varchar(50) not null,
  source_account_label text null,
  account_id          uuid not null references accounts(id),
  valid_from          date not null,
  valid_to            date null,
  unique (organisation_id, source_system_code, source_account_code, valid_from)
);

-- One snapshot = one unit's report for one period cut-off (e.g. BCC, June 2026, monthly operating report).
create table reporting_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  operating_unit_id  uuid not null references operating_units(id),
  fiscal_period_id   uuid not null references fiscal_periods(id),
  snapshot_type      varchar(30) not null check (snapshot_type in ('MONTHLY_OPERATING_REPORT','BUDGET','DEBTORS','LOAN_LEASE_SCHEDULE')),
  as_of_date         date not null,
  unique (operating_unit_id, fiscal_period_id, snapshot_type, as_of_date)
);

-- Versions of that snapshot. Dashboards read LATEST APPROVED; editors work on the DRAFT.
create table report_versions (
  id                    uuid primary key default gen_random_uuid(),
  reporting_snapshot_id uuid not null references reporting_snapshots(id),
  version_no            integer not null,
  status                varchar(20) not null default 'DRAFT' check (status in ('DRAFT','IN_REVIEW','APPROVED','SUPERSEDED','REJECTED')),
  supersedes_version_id uuid null references report_versions(id),
  import_batch_id       uuid null references import_batches(id),
  created_by            uuid null references users(id),
  created_at            timestamptz not null default now(),
  submitted_at          timestamptz null,
  approved_by           uuid null references users(id),
  approved_at           timestamptz null,
  notes                 text null,
  unique (reporting_snapshot_id, version_no)
);

-- ============================================================
-- 5. Facts and everything derived from them
-- ============================================================
-- One fact = (version, unit, period, account, scenario, basis) → amount.
--   scenario:     ACTUAL | BUDGET | FORECAST | PRIOR_YEAR_ACTUAL
--   period_basis: PERIOD | YEAR_TO_DATE | FULL_YEAR | END_OF_YEAR_ESTIMATE | CLOSING_BALANCE
-- The four columns on the Details tab are: (BUDGET,YTD) (ACTUAL,YTD) (BUDGET,FULL_YEAR) (FORECAST,END_OF_YEAR_ESTIMATE).
create table financial_facts (
  id                 uuid primary key default gen_random_uuid(),
  report_version_id  uuid not null references report_versions(id),
  operating_unit_id  uuid not null references operating_units(id),
  fiscal_period_id   uuid not null references fiscal_periods(id),
  account_id         uuid not null references accounts(id),
  scenario           varchar(20) not null check (scenario in ('ACTUAL','BUDGET','FORECAST','PRIOR_YEAR_ACTUAL')),
  period_basis       varchar(25) not null check (period_basis in ('PERIOD','YEAR_TO_DATE','FULL_YEAR','END_OF_YEAR_ESTIMATE','CLOSING_BALANCE')),
  amount_minor       bigint not null,
  currency_code      char(3) not null default 'AUD',
  source_row_id      uuid null references import_rows(id),
  source_row_code    varchar(50) null,
  source_row_label   text null,
  created_by         uuid null references users(id),
  created_at         timestamptz not null default now(),
  unique (report_version_id, operating_unit_id, fiscal_period_id, account_id, scenario, period_basis)
);
create index financial_facts_lookup on financial_facts (operating_unit_id, fiscal_period_id, report_version_id);

-- Totals printed on page 1 of the source report. Kept so the calculated roll-up can be checked against them.
create table reported_totals (
  id                 uuid primary key default gen_random_uuid(),
  report_version_id  uuid not null references report_versions(id),
  operating_unit_id  uuid not null references operating_units(id),
  reporting_group_id uuid null references reporting_groups(id),   -- null for whole-statement metrics
  metric_code        varchar(50) not null,             -- 'GROUP_TOTAL', 'TOTAL_INCOME', 'EBIDA_ADDBACK', ...
  scenario           varchar(20) not null,
  period_basis       varchar(25) not null,
  amount_minor       bigint not null,
  source_page        varchar(100) null
);
create unique index reported_totals_unique on reported_totals
  (report_version_id, operating_unit_id, metric_code, coalesce(reporting_group_id, '00000000-0000-0000-0000-000000000000'::uuid), scenario, period_basis);

-- Result of comparing reported_totals with the calculated roll-up when a version is approved (and on demand).
create table reconciliation_checks (
  id                 uuid primary key default gen_random_uuid(),
  report_version_id  uuid not null references report_versions(id),
  check_code         varchar(100) not null,            -- 'GROUP_EOY_DETAIL_TO_OVERVIEW', 'EBIDA_ADDBACK', ...
  reporting_group_id uuid null references reporting_groups(id),
  scenario           varchar(20) null,
  period_basis       varchar(25) null,
  expected_minor     bigint not null,                  -- declared (page 1)
  actual_minor       bigint not null,                  -- calculated from lines
  difference_minor   bigint not null,
  tolerance_minor    bigint not null default 1000,     -- $10
  status             varchar(20) not null check (status in ('PASS','WARNING','FAILED','RESOLVED','WAIVED')),
  explanation        text null,
  resolved_by        uuid null references users(id),
  resolved_at        timestamptz null,
  checked_at         timestamptz not null default now()
);

-- Family debtors this year vs last year (Synergetic later; typed now).
create table receivables_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  report_version_id  uuid null references report_versions(id),
  operating_unit_id  uuid not null references operating_units(id),
  as_of_date         date not null,
  receivable_type    varchar(30) not null check (receivable_type in ('FAMILY_DEBTORS','STUDENT_FEES_RECEIVABLE','OVERSEAS_STUDENT_DEBTORS','OTHER_RECEIVABLES')),
  balance_minor      bigint not null,
  currency_code      char(3) not null default 'AUD',
  source_system_code varchar(20) not null references source_systems(code) default 'MANUAL',
  unique (operating_unit_id, as_of_date, receivable_type)
);

-- Loans and leases as obligations with a schedule; the dashboard's "payment" is one schedule figure, labelled.
create table financial_obligations (
  id                  uuid primary key default gen_random_uuid(),
  operating_unit_id   uuid not null references operating_units(id),
  obligation_type     varchar(30) not null check (obligation_type in ('LOAN','FINANCE_LEASE','OPERATING_LEASE','OTHER')),
  name                text not null,
  counterparty        text null,
  reference_no        varchar(100) null,
  start_date          date null,
  end_date            date null,
  original_principal_minor bigint null,
  interest_rate       numeric(9,6) null,
  payment_frequency   varchar(30) null,                -- 'Monthly', 'YTD amortisation' (as on the boards)
  status              varchar(20) not null default 'ACTIVE',
  notes               text null
);

create table obligation_schedule_lines (
  id                      uuid primary key default gen_random_uuid(),
  financial_obligation_id uuid not null references financial_obligations(id),
  fiscal_period_id        uuid null references fiscal_periods(id),
  due_date                date not null,
  figure_kind             varchar(30) not null check (figure_kind in ('CASH_PAYMENT','INTEREST_EXPENSE','PRINCIPAL_REDUCTION','AMORTISATION','OUTSTANDING_LIABILITY')),
  amount_minor            bigint not null,
  status                  varchar(20) not null default 'SCHEDULED'
);

-- Narrative: current impacts, upcoming impacts, strategic note, accountant queries, data-quality issues.
create table commentary_notes (
  id                 uuid primary key default gen_random_uuid(),
  operating_unit_id  uuid not null references operating_units(id),
  fiscal_period_id   uuid null references fiscal_periods(id),
  report_version_id  uuid null references report_versions(id),
  note_type          varchar(30) not null check (note_type in ('CURRENT_IMPACT','UPCOMING_IMPACT','STRATEGIC_NOTE','VARIANCE_EXPLANATION','DATA_QUALITY_ISSUE','ACCOUNTANT_QUERY','BOARD_NOTE')),
  title              text null,
  body               text not null,
  account_id         uuid null references accounts(id),
  reporting_group_id uuid null references reporting_groups(id),
  severity           varchar(20) not null default 'INFO' check (severity in ('INFO','WATCH','WARNING','CRITICAL')),
  status             varchar(20) not null default 'OPEN' check (status in ('OPEN','RESOLVED','ARCHIVED')),
  created_by         uuid null references users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  resolved_by        uuid null references users(id),
  resolved_at        timestamptz null
);

-- ============================================================
-- 6. Weekly education databoard (raw fields only; lights and finance figures are derived)
-- ============================================================
create table weekly_boards (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  week_ending     date not null,
  status          varchar(20) not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','ARCHIVED')),
  published_by    uuid null references users(id),
  published_at    timestamptz null,
  unique (organisation_id, week_ending)
);

-- The four judgement lights per unit. OVERALL and FINANCE are never stored: Finance comes from the
-- approved finance version (surplus vs budget), Overall is the worst of the five.
create table board_health_ratings (
  weekly_board_id   uuid not null references weekly_boards(id),
  operating_unit_id uuid not null references operating_units(id),
  measure           varchar(20) not null check (measure in ('ENROLMENTS','STAFFING','BUILDINGS','WHS')),
  rating            varchar(10) not null check (rating in ('GREEN','AMBER','RED')),
  note              text null,
  primary key (weekly_board_id, operating_unit_id, measure)
);
-- Free-text note on the Finance cell is allowed (the light itself is derived).
create table board_cell_notes (
  weekly_board_id   uuid not null references weekly_boards(id),
  operating_unit_id uuid not null references operating_units(id),
  measure           varchar(20) not null check (measure in ('OVERALL','FINANCE')),
  note              text not null,
  primary key (weekly_board_id, operating_unit_id, measure)
);

-- Cash strip. OPERATING_RESULT is derived from the finance boards and therefore not a row here.
create table cash_position_items (
  weekly_board_id uuid not null references weekly_boards(id),
  item_kind       varchar(30) not null check (item_kind in ('CASH_ON_HAND','LOAN_BALANCES','RESERVES','OTHER')),
  label           text not null,
  amount_minor    bigint not null,
  change_note     text null,                            -- '↑ $42k on last week'
  display_order   smallint not null default 0,
  primary key (weekly_board_id, item_kind)
);

-- Per-school snapshot card. Budget and variance are derived; these are the raw parts.
create table unit_snapshots (
  weekly_board_id     uuid not null references weekly_boards(id),
  operating_unit_id   uuid not null references operating_units(id),
  building_project    text null,
  project_progress_pct smallint null check (project_progress_pct between 0 and 100),
  loan_balance_minor  bigint null,
  loan_balance_note   text null,                        -- '$0 (grant funded)'
  payments_note       text null,                        -- '$8.4k / month'
  staffing_note       text null,
  enrolment_note      text null,
  primary key (weekly_board_id, operating_unit_id)
);

-- Enrolment points behind the sparkline. Synergetic / Hubworks feed this later.
create table enrolment_census (
  id                 uuid primary key default gen_random_uuid(),
  operating_unit_id  uuid not null references operating_units(id),
  census_date        date not null,
  headcount          integer not null,
  occupancy_pct      numeric(5,2) null,                 -- ELC
  source_system_code varchar(20) not null references source_systems(code) default 'MANUAL',
  unique (operating_unit_id, census_date)
);

-- Risk register, WHS items and celebrations.
create table board_items (
  id              uuid primary key default gen_random_uuid(),
  weekly_board_id uuid not null references weekly_boards(id),
  item_kind       varchar(20) not null check (item_kind in ('RISK','WHS','CELEBRATION')),
  rating          varchar(10) null check (rating in ('GREEN','AMBER','RED')),   -- null for celebrations
  title           text not null,
  detail          text null,
  owner           text null,
  operating_unit_id uuid null references operating_units(id),
  display_order   smallint not null default 0,
  carried_from_item_id uuid null references board_items(id)   -- rolled forward from last week
);

-- ============================================================
-- 7. Guards
-- ============================================================
-- Facts of an approved or superseded version cannot change; publish a new version instead.
create or replace function reject_change_to_approved_version() returns trigger language plpgsql as $$
declare v_status text;
begin
  select status into v_status from report_versions where id = coalesce(new.report_version_id, old.report_version_id);
  if v_status in ('APPROVED','SUPERSEDED') then
    raise exception 'report version % is %, create a new version instead', coalesce(new.report_version_id, old.report_version_id), v_status;
  end if;
  return coalesce(new, old);
end $$;

create trigger financial_facts_immutable_when_approved
  before insert or update or delete on financial_facts
  for each row execute function reject_change_to_approved_version();
create trigger reported_totals_immutable_when_approved
  before insert or update or delete on reported_totals
  for each row execute function reject_change_to_approved_version();

-- Seed reference rows
insert into roles values ('ADMIN','Manages users, mappings and metric definitions'),
                         ('FINANCE','Enters and approves finance figures'),
                         ('PRINCIPAL','Views own school, edits its weekly databoard fields'),
                         ('BOARD','Reads every board');
insert into source_systems values ('MANUAL','Typed or uploaded by a person'),
                                  ('MYOB','MYOB Business API'),
                                  ('SYNERGETIC','Synergetic (Education Horizons) REST API'),
                                  ('HUBWORKS','Hubworks API / SFTP export');
