# Owner OS Engine

> Personal operating system at **owner.awesomepg.in**  
> Independent Engine (DB · auth · routes · layouts) — same hosting pattern as Automotive Capital / FYH.  
> Baseline: [[ECOSYSTEM_BASELINE_V1]] · Health Score must remain **100** · Health Brain not modified.

## What this Engine is

Your financial life OS. Not ERP. Not accounting software.

It **owns** Owner-domain Brains and **consumes** Awesome PG / FYH / Capital (and future Engines) via public Brain APIs + events.

## Phase 1 (this ship)

- Host routing (`OWNER_DEV_HOST=1` locally)
- Separate DB (`OWNER_DATABASE_URL`) + `oo_*` auth/event tables
- Cookie auth (`oo_session`)
- Navigation + dashboard / net-worth / settings shells
- Brain registry (Owner · Personal Finance · Net Worth · …)
- Event inbox consumers (no fake payloads)
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

## Stop

Phase 1 complete — await approval before Phase 2.
