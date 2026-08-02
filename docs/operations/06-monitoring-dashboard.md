# Room OS Monitoring Dashboard Checklist

Track these metrics daily after deploy and continuously after flag cutover.

## 1. Outbox health

**Source:** `GET /api/cron/room-os-outbox` response JSON, or `getRoomOsOutboxMetrics()` via production audit.

| Metric | Field | Healthy | Investigate |
|--------|-------|---------|-------------|
| Pending count | `after.pending` | ≤ 50 | > 50 |
| Pending count | `after.pending` | — | > 100 (FAIL threshold) |
| Oldest pending age | `oldestPendingAgeMs` | < 15 min | > 30 min |
| Dead-letter rows | `deadLetter` | 0 | > 0 |
| Processed per drain | `processed` | > 0 when backlog exists | 0 with pending > 0 |
| Pending remaining | `pendingRemaining` | trending down | flat/increasing 1h+ |

**Code thresholds:** `src/roomOs/outbox/metrics.ts` — `evaluateRoomOsOutboxHealth()`

## 2. Materialization freshness

**Source:** `npx tsx scripts/run-room-os-materialization-audit.ts` or admin gate **Room OS Materialization Freshness**.

| Index | Field | Warn | Fail |
|-------|-------|------|------|
| Property OS | `propertyMaterializedAgeMs` | > 6 h | > 24 h |
| Work queue | `workQueueMaterializedAgeMs` | > 6 h | > 24 h |
| Business metrics | `businessMetricsMaterializedAgeMs` | > 6 h | > 24 h |
| Missing row | any null age | warning (live_fallback) | fail if sustained post-cutover |

**Code:** `src/roomOs/acceptance/materializationFreshnessAudit.ts`

## 3. Certification status

Run after deploy and weekly:

```bash
npm run cert:room-os-wave2
npm run cert:room-os-wave6
```

| Status | Action |
|--------|--------|
| `pass` | No action |
| `warn` | Review findings; acceptable pre-cutover for missing materialized rows |
| `fail` | Block flag cutover; investigate before enable |

## 4. Ops parity (when preparing cutover)

**Source:** `npx tsx scripts/run-room-os-ops-parity-audit.ts` or admin gate **Room OS Ops Centre Parity**.

| Check | Healthy |
|-------|---------|
| Shared tabs (rent due, overdue, electricity) | legacy count = room-os count |
| Property index parity fail count | 0 |
| Work queue parity fail count | 0 |

## 5. API materialization status (post flag cutover)

When flags on, spot-check that materialized reads dominate:

- `loadPropertyIndex` → `status: 'ready'` (not sustained `live_fallback`)
- `getWorkQueue` → `status: 'ready'`
- `loadBusinessMetrics` → `status: 'ready'`

Sustained `live_fallback` after cutover indicates outbox lag or missing drain.

## 6. Cron execution

| Check | How |
|-------|-----|
| Cron runs every 5 min | Vercel cron logs for `/api/cron/room-os-outbox` |
| No 401 responses | `CRON_SECRET` mismatch |
| No 500 `CRON_SECRET not configured` | Env var missing |

## Admin dashboard

**URL:** `/admin/system/production-audit`

Gates to monitor:

1. **Room OS Outbox Health** (`room_os_outbox`)
2. **Room OS Materialization Freshness** (`room_os_materialization`)
3. **Room OS Ops Centre Parity** (`room_os_ops_parity`) — before/during cutover

## Suggested dashboard panels

If using external monitoring (Datadog, etc.), create panels for:

1. Outbox pending count (gauge)
2. Outbox dead-letter count (gauge, alert on > 0)
3. Oldest pending age (minutes)
4. Materialization ages (3 series: property, work queue, business metrics)
5. Cron success rate for room-os-outbox
6. Cert last-run status (manual or CI artifact)

See [07-alerts.md](./07-alerts.md) for alert thresholds.
