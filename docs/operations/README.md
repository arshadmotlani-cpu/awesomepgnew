# Room OS Production Operations

Production rollout documentation for Room OS (Waves 0–6). Architecture is frozen; these runbooks cover deployment, monitoring, and cutover only.

**Engineering sign-off:** 90/100 — ship behind feature flags.

**Recommendation:** Enable `ROOM_OS_OPERATIONS_QUEUE` and `ROOM_OS_BILLING_CENTRE` only after migrations, certification, and parity audits pass on the target environment.

## Runbooks

| Doc | Purpose |
|-----|---------|
| [01-deployment-checklist.md](./01-deployment-checklist.md) | Pre-deploy, deploy, and post-deploy gates |
| [02-migration-order.md](./02-migration-order.md) | Database migration sequence (0132–0138) |
| [03-environment-variables.md](./03-environment-variables.md) | Required and optional env vars |
| [04-feature-flag-rollout.md](./04-feature-flag-rollout.md) | Staged flag enablement plan |
| [05-rollback-procedure.md](./05-rollback-procedure.md) | Instant rollback via flags |
| [06-monitoring-dashboard.md](./06-monitoring-dashboard.md) | Metrics and dashboards to watch |
| [07-alerts.md](./07-alerts.md) | Alert rules for outbox, materialization, cert |
| [08-smoke-tests.md](./08-smoke-tests.md) | Automated smoke commands |
| [09-manual-qa-checklist.md](./09-manual-qa-checklist.md) | Admin UI manual verification |
| [10-disaster-recovery.md](./10-disaster-recovery.md) | Outbox backlog, dead-letter, stale indexes |
| [11-production-runbook.md](./11-production-runbook.md) | Daily ops and incident cheat sheet |
| [12-launch-day-checklist.md](./12-launch-day-checklist.md) | T-24h through T+24h launch timeline |

## Related documentation

- Architecture: [ROOM_OS.md](../ROOM_OS.md)
- Wave 2 completion: [ROOM_OS_WAVE2_COMPLETION.md](../ROOM_OS_WAVE2_COMPLETION.md)
- Wave 6 completion: [ROOM_OS_WAVE6_COMPLETION.md](../ROOM_OS_WAVE6_COMPLETION.md)
- Recovery: [OPERATIONS_RECOVERY.md](../OPERATIONS_RECOVERY.md)

## Quick reference

```bash
# Migrations
npm run db:migrate

# Certification (requires DATABASE_URL)
npm run cert:room-os-wave2
npm run cert:room-os-wave6

# Audits
npx tsx scripts/run-room-os-materialization-audit.ts
npx tsx scripts/run-room-os-ops-parity-audit.ts

# Outbox drain (requires CRON_SECRET)
curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/room-os-outbox
```

Admin production audit: `/admin/system/production-audit`
