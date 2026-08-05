# Owner OS Engine

> Personal operating system at **owner.awesomepg.in**  
> Independent Engine (DB · auth · routes · layouts) — same hosting pattern as Automotive Capital / FYH.  
> Baseline: [[ECOSYSTEM_BASELINE_V1]] · Health Score must remain **100** · Health Brain not modified.

## What this Engine is

Your financial life OS. Not ERP. Not accounting software.

It **owns** Owner-domain Brains and **consumes** Awesome PG / FYH / Capital (and future Engines) via public Brain APIs + events.

## Phase status (5 Aug 2026)

| Phase | Status | Delivered |
|-------|--------|-----------|
| 0 Foundation | ✅ | `connected` metric model · PG admin `OwnerSummaryCard` · components under `src/owner/components/` |
| 1 Homepage | ✅ | `OwnerHomeDashboard` · connected metrics · Connect later section |
| 2 Intelligence | ✅ | Brain Health · Business Health · Owner Tasks · Recent Events panels |
| 3 Domain pages | ✅ | `/cashflow` · `/assets` · `/liabilities` · `/investments` · `/forecast` · `/tax` · `/wealth` |
| 4 Events | ✅ | Engine emitters · `/api/cron/owner-os-event-inbox` · inbox status on settings |
| 5 PG polish | ✅ | `/api/admin/payments` (legacy `/api/owner/payments` redirects) |
| 6 Verify | ✅ | `npm run test:owner` · `npm run test:pg` · build green |

## Phase 1 (foundation ship)

- Host routing (`OWNER_DEV_HOST=1` locally)
- Separate DB (`OWNER_DATABASE_URL`) + `oo_*` auth/event tables
- Cookie auth (`oo_session`)
- Navigation + dashboard / net-worth / settings shells
- Brain registry (Owner · Personal Finance · Net Worth · …)
- Event inbox consumers + emitters (PG rent · Salon invoice · Capital · Workforce)
- Shared Finance API → `@/src/personalFinance` (no duplicated math)

## Env

```bash
OWNER_DATABASE_URL=…
OWNER_ADMIN_EMAIL=owner@awesomepg.in
OWNER_ADMIN_PASSWORD=…   # ≥8 for seed
OWNER_DEV_HOST=1         # treat localhost as Owner OS
NEXT_PUBLIC_OWNER_URL=https://owner.awesomepg.in
```

```bash
npm run owner:db:migrate
npm run owner:db:seed
npm run test:owner
```

## Architecture

See [[OWNER_OS_ARCHITECTURE]].

## PG admin

PG Overview (`/admin/overview`) shows a small **OwnerSummaryCard** + link to Owner OS — not the full life dashboard.
