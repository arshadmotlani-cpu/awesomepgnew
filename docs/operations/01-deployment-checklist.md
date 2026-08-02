# Room OS Production Deployment Checklist

Use this checklist for every production deploy that includes Room OS code or migrations.

## Pre-deploy

- [ ] Code merged and reviewed; no architecture changes in this release
- [ ] `node --import tsx --test tests/unit/roomOs*.test.ts` passes locally (205 tests)
- [ ] `npm run build` succeeds
- [ ] Staging database has migrations 0132–0138 applied (see [02-migration-order.md](./02-migration-order.md))
- [ ] Staging certification passes:
  - [ ] `npm run cert:room-os-wave2`
  - [ ] `npm run cert:room-os-wave4`
  - [ ] `npm run cert:room-os-wave5`
  - [ ] `npm run cert:room-os-wave6`
- [ ] Staging materialization audit passes: `npx tsx scripts/run-room-os-materialization-audit.ts`
- [ ] Staging ops parity audit reviewed: `npx tsx scripts/run-room-os-ops-parity-audit.ts`
- [ ] Environment variables documented in [03-environment-variables.md](./03-environment-variables.md) are set on target
- [ ] `CRON_SECRET` configured on Vercel (required for outbox cron)
- [ ] Feature flags **off** on production unless executing [04-feature-flag-rollout.md](./04-feature-flag-rollout.md):
  - [ ] `ROOM_OS_OPERATIONS_QUEUE` unset or `0`
  - [ ] `ROOM_OS_BILLING_CENTRE` unset or `0`

## Deploy

- [ ] Deploy application to production (standard Vercel deploy)
- [ ] Run migrations against production database:
  ```bash
  DATABASE_URL=<prod> npm run db:migrate
  ```
- [ ] Verify migration applied (see verify queries in [02-migration-order.md](./02-migration-order.md))
- [ ] Confirm `vercel.json` cron includes `/api/cron/room-os-outbox` at `*/5 * * * *`

## Post-deploy (before flag cutover)

- [ ] Trigger outbox drain manually:
  ```bash
  CRON_SECRET=<secret> npx tsx scripts/post-deploy-ops.ts
  ```
  Or:
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/room-os-outbox
  ```
- [ ] Response shows `ok: true`; note `pendingRemaining` and `deadLetter`
- [ ] Run production certification against prod DB (read-only):
  ```bash
  DATABASE_URL=<prod> npm run cert:room-os-wave6
  ```
- [ ] Open admin production audit: `/admin/system/production-audit`
  - [ ] **Room OS Outbox Health** — PASS
  - [ ] **Room OS Materialization Freshness** — PASS (warnings acceptable pre-cutover if live_fallback expected)
  - [ ] **Room OS Ops Centre Parity** — PASS (when preparing flag cutover)
- [ ] Run smoke tests from [08-smoke-tests.md](./08-smoke-tests.md)

## Flag cutover (separate step)

Do not enable flags in the same deploy as schema migration unless staging parity is proven.

- [ ] Follow [04-feature-flag-rollout.md](./04-feature-flag-rollout.md)
- [ ] Complete [09-manual-qa-checklist.md](./09-manual-qa-checklist.md) after each flag change
- [ ] Monitor per [06-monitoring-dashboard.md](./06-monitoring-dashboard.md) for 24h

## Rollback reference

If issues occur after flag enablement, see [05-rollback-procedure.md](./05-rollback-procedure.md).
