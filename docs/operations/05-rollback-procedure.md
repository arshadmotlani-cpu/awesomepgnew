# Room OS Rollback Procedure

Room OS rollback is **instant** via feature flags. No schema rollback required.

## Immediate rollback (< 1 minute)

1. Set flags off in Vercel environment (Production):
   ```
   ROOM_OS_OPERATIONS_QUEUE=0
   ROOM_OS_BILLING_CENTRE=0
   ```
   Or unset both variables entirely.

2. Redeploy if your platform requires env refresh; Vercel typically picks up env changes on next request for serverless functions.

3. Verify legacy path restored:
   - Operations Centre loads without Room OS adapter errors
   - Billing Centre uses legacy collections composer

## What rollback does NOT do

- Does **not** drop `room_os_outbox` or materialized index tables
- Does **not** stop outbox cron (cron continues; harmless when flags off)
- Does **not** revert payment approvals/rejections (Payment SSOT unchanged throughout)
- Does **not** delete workflow instances (table may be empty until workflow UI wired)

Materialized rows remain as a read cache. Legacy path ignores them when flags are off.

## Verification after rollback

```bash
# Legacy certification should still pass
DATABASE_URL=<prod> npm run cert:room-os-wave2

# Ops parity with forceSource legacy (if running audit CLI)
DATABASE_URL=<prod> npx tsx scripts/run-room-os-ops-parity-audit.ts
```

Admin UI:

- [ ] Operations Centre shared tabs match pre-cutover behavior
- [ ] No increase in payment proof errors
- [ ] Billing Centre collections load correctly

## Outbox during rollback

Outbox cron continues every 5 minutes. This is safe:

- Projectors upsert idempotently
- No admin UI reads materialized data when flags off
- Backlog drain reduces pending rows over time

If outbox itself is the incident (dead-letter rows), see [10-disaster-recovery.md](./10-disaster-recovery.md) — rollback flags alone may not suffice.

## Re-attempt cutover

After fixing root cause:

1. Confirm staging parity PASS
2. Re-enable flags per [04-feature-flag-rollout.md](./04-feature-flag-rollout.md)
3. Complete [12-launch-day-checklist.md](./12-launch-day-checklist.md) abbreviated smoke section

## Code rollback (last resort)

If a **code defect** requires revert (not flag issue):

1. Revert git deploy to last known good release
2. Keep flags off
3. Migrations are forward-only — do not drop tables
4. Run cert suite to confirm baseline

Document incident in ops log per [11-production-runbook.md](./11-production-runbook.md).
