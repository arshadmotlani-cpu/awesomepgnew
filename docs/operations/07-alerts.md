# Room OS Alerts

Alert rules mapped to code thresholds in `src/roomOs/outbox/metrics.ts` and `materializationFreshnessAudit.ts`.

## Critical (page immediately)

| Alert | Condition | Source | Action |
|-------|-----------|--------|--------|
| Outbox dead-letter | `deadLetter > 0` | Cron JSON `deadLetter` or `getRoomOsOutboxMetrics()` | See [10-disaster-recovery.md](./10-disaster-recovery.md) § Dead-letter |
| Outbox cron failure | HTTP != 200 from `/api/cron/room-os-outbox` for 2 consecutive runs | Vercel cron logs | Check `CRON_SECRET`; check app deploy |
| Cert fail post-cutover | `npm run cert:room-os-wave6` exits 1 | CI or manual | Rollback flags; investigate parity |
| Ops parity fail | Admin gate `room_os_ops_parity` FAIL with flags on | Production audit | [05-rollback-procedure.md](./05-rollback-procedure.md) |

## Warning (investigate within 1 hour)

| Alert | Condition | Source |
|-------|-----------|--------|
| Outbox backlog high | `pending > 50` | Cron JSON |
| Outbox backlog critical | `pending > 100` | `evaluateRoomOsOutboxHealth` FAIL |
| Oldest pending stale | `oldestPendingAgeMs > 15 min` | Cron JSON |
| Oldest pending fail | `oldestPendingAgeMs > 30 min` | `evaluateRoomOsOutboxHealth` FAIL |
| Property index stale | age > 6 h | Materialization audit |
| Work queue stale | age > 6 h | Materialization audit |
| Business metrics stale | age > 6 h | Materialization audit |
| Materialization fail | any index age > 24 h | Materialization audit |
| Pending not draining | `pendingRemaining` unchanged for 60 min with new ledger activity | Cron trend |

## Informational (daily review)

| Alert | Condition |
|-------|-----------|
| Cert warnings | warn findings only (missing materialized row pre-cutover) |
| `live_fallback` API responses | expected before first drain; investigate if sustained after flag cutover |
| Failed retryable outbox | `failedRetryable > 0` — monitor; auto-retries with backoff |

## Outbox retry policy (reference)

From `src/roomOs/outbox/retryPolicy.ts`:

- Max attempts: **5**
- Backoff: **60s, 5m, 15m, 15m**
- After 5 failures: dead-letter (`status = 'failed'`, `attemptCount >= 5`)

## Cron alert setup (Vercel)

Monitor Vercel cron invocations for path `/api/cron/room-os-outbox`:

- Schedule: every 5 minutes
- Expected: HTTP 200 with `"ok": true`
- Alert on: 401 (auth), 500 (config), timeout (> 120s `maxDuration`)

## Manual drain for alert response

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://<domain>/api/cron/room-os-outbox?batchSize=50&maxBatches=20"
```

Optional larger drain during incident:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://<domain>/api/cron/room-os-outbox?batchSize=100&maxBatches=50"
```

Max per default cron invocation: 50 × 20 = **1000 events**.

## Certification alert (CI)

If Room OS paths change in PR, regression report may run `cert:room-os-wave2` when `DATABASE_URL` is set. Alert on CI failure before merge to main.

## Escalation

1. On-call checks [11-production-runbook.md](./11-production-runbook.md)
2. If flags on and user impact: execute [05-rollback-procedure.md](./05-rollback-procedure.md)
3. If data integrity concern: [10-disaster-recovery.md](./10-disaster-recovery.md)
