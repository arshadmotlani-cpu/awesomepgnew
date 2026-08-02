# Room OS Feature Flag Rollout Plan

Both flags default **off**. Production payment processing continues via Payment SSOT and legacy composers until flags are enabled.

## Flags

| Flag | Surface | Legacy path when off |
|------|---------|----------------------|
| `ROOM_OS_OPERATIONS_QUEUE` | Operations Centre rent/electricity queue | `unifiedOperationsQueue.ts` legacy composers |
| `ROOM_OS_BILLING_CENTRE` | Billing Centre collections queue | `billingCentreDashboard.ts` legacy path |

## Rollout phases

### Phase 0 — Deploy without flags (current production state)

- Migrations 0132–0138 applied
- Outbox cron draining
- Materialized indexes populating
- Flags **off**
- Payment approve/reject unchanged (Payment SSOT)

**Exit criteria:** Outbox health PASS; materialization audit no FAIL severity; cert wave6 no fail findings.

### Phase 1 — Staging validation

1. Set on staging only:
   ```
   ROOM_OS_OPERATIONS_QUEUE=1
   ```
2. Run ops parity audit:
   ```bash
   DATABASE_URL=<staging> npx tsx scripts/run-room-os-ops-parity-audit.ts
   ```
3. Complete [09-manual-qa-checklist.md](./09-manual-qa-checklist.md) on staging
4. Monitor 24h per [06-monitoring-dashboard.md](./06-monitoring-dashboard.md)

### Phase 2 — Production Operations Centre cutover

1. Confirm Phase 1 parity PASS on staging
2. Set production:
   ```
   ROOM_OS_OPERATIONS_QUEUE=1
   ```
3. Redeploy or update Vercel env (env-only change does not require code redeploy if vars are runtime)
4. Smoke test Operations Centre tabs (rent due, overdue, electricity)
5. Monitor 24h; alerts per [07-alerts.md](./07-alerts.md)
6. Keep rollback plan ready: [05-rollback-procedure.md](./05-rollback-procedure.md)

### Phase 3 — Billing Centre cutover (independent)

1. Staging first:
   ```
   ROOM_OS_BILLING_CENTRE=1
   ```
2. Verify collections queue counts and amounts match legacy on staging
3. Production:
   ```
   ROOM_OS_BILLING_CENTRE=1
   ```
4. Manual QA: Billing Centre filters, overdue/due-soon tabs
5. Monitor 24h

### Phase 4 — Optional post-cutover (not launch blocker)

- Wire admin payment actions to workflow API (`workflow/v1`) for workflow instance + timeline facts
- Enable integrity preflight consumers per `OPERATIONS_RECOVERY.md`

## Parity testing without toggling production

Ops parity audit supports `forceSource: 'legacy' | 'room_os'` in code — use staging or audit CLI to compare paths without flipping production flags mid-audit.

## Rollback trigger

Rollback immediately if:

- Ops parity FAIL on shared tabs
- Dead-letter outbox rows > 0
- User-visible wrong bed/room labels in queue items
- Collections amounts mismatch legacy beyond documented tolerance

See [05-rollback-procedure.md](./05-rollback-procedure.md).
