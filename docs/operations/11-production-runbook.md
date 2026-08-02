# Room OS Production Runbook

Consolidated operations reference for Room OS in production.

## System overview

Room OS is an event-sourced read model behind feature flags:

| Flag | Default | Effect |
|------|---------|--------|
| `ROOM_OS_OPERATIONS_QUEUE` | off | Operations Centre uses Room OS adapters |
| `ROOM_OS_BILLING_CENTRE` | off | Billing Centre uses Room OS collections |

**Architecture:** Ledger events → `room_os_outbox` → cron drain → projectors → materialized indexes.

**Sign-off:** 90/100 — ship behind flags. Payment SSOT unchanged for admin payments.

---

## Daily checks (5 min)

1. Open `/admin/system/production-audit` — all Room OS gates PASS or warn-only
2. Confirm cron ran in last 10 min (Vercel logs)
3. If flags on: spot-check Operations Centre rent due tab loads

```bash
# Optional CLI
DATABASE_URL=<prod> npx tsx scripts/run-room-os-materialization-audit.ts
```

---

## Weekly checks (15 min)

```bash
DATABASE_URL=<prod> npm run cert:room-os-wave2
DATABASE_URL=<prod> npm run cert:room-os-wave6
DATABASE_URL=<prod> npx tsx scripts/run-room-os-ops-parity-audit.ts
```

Review [06-monitoring-dashboard.md](./06-monitoring-dashboard.md) metrics trends.

---

## Incident response

### Step 1: Assess impact

| Question | Action |
|----------|--------|
| Are flags on? | Check Vercel env |
| User-visible wrong data? | Rollback flags immediately |
| Outbox only? | Drain; may not need rollback |
| Dead-letter? | See [10-disaster-recovery.md](./10-disaster-recovery.md) |

### Step 2: Mitigate

**User impact with flags on:**

1. [05-rollback-procedure.md](./05-rollback-procedure.md) — unset flags (< 1 min)
2. Verify Operations Centre loads legacy path
3. Communicate status

**No user impact, outbox lag:**

1. Manual cron drain with extended batches
2. Monitor `pendingRemaining` trend

### Step 3: Resolve

1. Identify root cause from `last_error` on failed outbox rows
2. Fix and replay dead-letter if needed
3. Re-run smoke tests before re-enabling flags

### Step 4: Post-incident

- Document in incident log
- Update runbooks if new failure mode discovered

---

## Command cheat sheet

| Task | Command |
|------|---------|
| Migrate | `npm run db:migrate` |
| Unit tests | `node --import tsx --test tests/unit/roomOs*.test.ts` |
| Cert wave 2 | `npm run cert:room-os-wave2` |
| Cert wave 3 | `npm run cert:room-os-wave3` |
| Cert wave 4 | `npm run cert:room-os-wave4` |
| Cert wave 5 | `npm run cert:room-os-wave5` |
| Cert wave 6 | `npm run cert:room-os-wave6` |
| Materialization audit | `npx tsx scripts/run-room-os-materialization-audit.ts` |
| Ops parity audit | `npx tsx scripts/run-room-os-ops-parity-audit.ts` |
| Cron drain | `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/room-os-outbox` |
| Post-deploy ops | `CRON_SECRET=<secret> npx tsx scripts/post-deploy-ops.ts` |
| Admin audit UI | `/admin/system/production-audit` |

---

## Key URLs

| Resource | Path |
|----------|------|
| Production audit | `/admin/system/production-audit` |
| Operations Centre | `/admin/operations` (or app-specific path) |
| Billing Centre | `/admin/billing` (or app-specific path) |
| Outbox cron | `GET /api/cron/room-os-outbox` |

---

## Health thresholds (quick reference)

| Metric | Warn | Fail |
|--------|------|------|
| Outbox pending | > 50 | > 100 |
| Oldest pending age | > 15 min | > 30 min |
| Dead-letter | any | > 0 |
| Index materialization age | > 6 h | > 24 h |

---

## Rollout phases

See [04-feature-flag-rollout.md](./04-feature-flag-rollout.md):

1. Deploy code + migrations (flags off)
2. Staging: enable flags, QA
3. Production: canary PG
4. Production: full cutover

---

## Contacts (fill in)

| Role | Name | Contact |
|------|------|---------|
| On-call engineering | | |
| DBA / infra | | |
| Product owner | | |
| Escalation | | |

---

## Document index

| # | Runbook |
|---|---------|
| — | [README.md](./README.md) |
| 01 | [Deployment checklist](./01-deployment-checklist.md) |
| 02 | [Migration order](./02-migration-order.md) |
| 03 | [Environment variables](./03-environment-variables.md) |
| 04 | [Feature flag rollout](./04-feature-flag-rollout.md) |
| 05 | [Rollback procedure](./05-rollback-procedure.md) |
| 06 | [Monitoring dashboard](./06-monitoring-dashboard.md) |
| 07 | [Alerts](./07-alerts.md) |
| 08 | [Smoke tests](./08-smoke-tests.md) |
| 09 | [Manual QA checklist](./09-manual-qa-checklist.md) |
| 10 | [Disaster recovery](./10-disaster-recovery.md) |
| 11 | This document |
| 12 | [Launch day checklist](./12-launch-day-checklist.md) |
