# Room OS Wave 2 — Completion Report

> **Date:** 2026-08-02  
> **Scope:** Operational infrastructure only — no engine/projector/event redesign.  
> **Architecture:** Frozen per `docs/ROOM_OS.md`.

---

## Verdict

**Wave 2 operational infrastructure is complete.** All eight completion-plan deliverables are implemented:

| Blocker (pre-completion) | Status |
|---|---|
| Outbox processor unwired | **Resolved** — cron route, Vercel schedule, post-deploy trigger, drain loop |
| No retry / failure visibility | **Resolved** — migration 0135, backoff, metrics, production audit gate |
| Certification not in release pipeline | **Resolved** — `cert:room-os-wave2`, portal cert chain, regression-report, stability rule |
| No ops parity audit | **Resolved** — `operationsParityAudit` + CLI + production audit gate |
| Materialization freshness unverified | **Resolved** — `materializationFreshnessAudit` + CLI + production audit gate |
| Performance unbenchmarked | **Resolved** — `bench:room-os-wave2` script (requires `DATABASE_URL` to capture numbers) |
| Feature-flag rollback unverified | **Resolved** — rollback tests + extended migration test suite |

**Production cutover of `ROOM_OS_OPERATIONS_QUEUE=1` remains an ops decision** — validation tooling is ready; flag defaults OFF.

---

## Files changed (Wave 2 completion batch)

### Outbox processor + retry

| File | Purpose |
|---|---|
| `app/api/cron/room-os-outbox/route.ts` | CRON_SECRET auth; drains outbox; returns metrics JSON |
| `vercel.json` | Cron `*/5 * * * *` for outbox drain |
| `scripts/post-deploy-ops.ts` | Post-deploy trigger for outbox cron |
| `src/db/migrations/0135_room_os_outbox_retry.sql` | `attempt_count`, `next_retry_at` |
| `src/db/schema/roomOsOutbox.ts` | Schema mirror |
| `src/roomOs/outbox/retryPolicy.ts` | 5 max attempts; 1m/5m/15m backoff |
| `src/roomOs/outbox/process.ts` | Retry on failure; `drainRoomOsOutbox()` |
| `src/roomOs/outbox/append.ts` | Ordered fetch; retryable failed rows |
| `src/roomOs/outbox/metrics.ts` | `getRoomOsOutboxMetrics()`, `evaluateRoomOsOutboxHealth()` |

### Certification → release gate

| File | Purpose |
|---|---|
| `scripts/run-room-os-wave2-certification.ts` | CLI; exit 1 on `fail` only |
| `src/roomOs/certification/formatReport.ts` | Table formatting; `certificationBlocksRelease()` |
| `scripts/run-shantinagar-phase1-portal-certification.ts` | Chains full cert after portal cert |
| `scripts/regression-report.ts` | Runs cert when Room OS files touched |
| `.cursor/rules/stability-phase.mdc` | Room OS release requirement |
| `package.json` | `cert:room-os-wave2`, `cert:room-os-wave2:json`, `bench:room-os-wave2` |

### Acceptance audits

| File | Purpose |
|---|---|
| `src/roomOs/acceptance/operationsParityAudit.ts` | Legacy vs Room OS queue comparison |
| `src/roomOs/acceptance/materializationFreshnessAudit.ts` | Outbox health + index age + parity drift |
| `scripts/run-room-os-ops-parity-audit.ts` | Ops parity CLI |
| `scripts/run-room-os-materialization-audit.ts` | Freshness CLI |
| `scripts/benchmark-room-os-wave2.ts` | Performance benchmark CLI |
| `src/services/unifiedOperationsQueue.ts` | `forceSource`, `loadOperationsQueueForParityAudit()` |
| `src/services/productionAudit.ts` | Gates: `room_os_outbox`, `room_os_materialization`, `room_os_ops_parity` |

### Tests

| File | Purpose |
|---|---|
| `tests/unit/roomOsWave2OutboxProcessor.test.ts` | Retry, drain, metrics, cron wiring |
| `tests/unit/roomOsWave2OpsParity.test.ts` | Comparison helpers |
| `tests/unit/roomOsWave2MaterializationFreshness.test.ts` | Age thresholds |
| `tests/unit/roomOsWave2Benchmark.test.ts` | Script structural guard |
| `tests/unit/roomOsWave2FeatureFlagRollback.test.ts` | Flag toggle + rollback |
| `tests/unit/roomOsArchitecture.test.ts` | Extended Wave 2 guards |
| `tests/unit/roomOsOperationsCentreMigration.test.ts` | Rollback scenarios |

---

## Architecture verification

All architecture guards pass (`tests/unit/roomOsArchitecture.test.ts`):

- Projectors do not import React/Next.js, settlement V2, or engines (WorkQueue)
- Integrity and certification modules do not import repair writers or outbox append
- **Acceptance modules** do not import projectors or repair writers
- Outbox cron route exists and wires `drainRoomOsOutbox`
- Cert script and npm scripts exist
- Ledger writers enqueue via outbox helper only

---

## Production readiness verification

### npm scripts

```bash
npm run cert:room-os-wave2          # Shantinagar parity gate (read-only)
npm run cert:room-os-wave2:json     # JSON output
npm run bench:room-os-wave2         # Performance benchmarks (needs DATABASE_URL)
npx tsx scripts/run-room-os-ops-parity-audit.ts
npx tsx scripts/run-room-os-materialization-audit.ts
```

### Cron

- **Route:** `GET /api/cron/room-os-outbox` (header `Authorization: Bearer $CRON_SECRET`)
- **Schedule:** every 5 minutes via Vercel cron
- **Response shape:** `{ ok, processed, failed, pendingRemaining, oldestPendingAgeMs, errors[] }`

### Production audit gates

| Gate ID | Policy |
|---|---|
| `room_os_outbox` | Fail if pending backlog or dead letters exceed thresholds |
| `room_os_materialization` | Warn/fail on stale materialized rows or content-hash drift |
| `room_os_ops_parity` | Surface last ops parity audit result when available |

### Ops parity policy

- **Must match exactly:** `waiting_for_approval`, `vacating_requests`, `refund_due`, `booking_approval`, `deposit_due`, `kyc_review`
- **Informational (deltas reported, not hard-fail):** `rent_due`, `electricity_due`

### Certification release policy

- Exit 1 only on `status === 'fail'`
- `warning` allowed (e.g. missing materialized rows pre-cutover)

---

## Performance numbers

**Benchmark not executed in CI/local sandbox** — `DATABASE_URL` was not configured.

To capture numbers for production sign-off:

```bash
npm run env:pull   # or set DATABASE_URL
npm run bench:room-os-wave2
```

The script measures (5 runs each, median + p95):

- `rebuildPropertyOsIndex()` — Shantinagar PG
- `rebuildWorkQueueIndex()`
- `loadPropertyIndex()` read
- `getWorkQueue()` read
- `loadRoomOsOperationsQueueItems()` ops adapter

**Gate:** median index read &lt; 500ms when scale ≤ 500 rooms (per `docs/ROOM_OS.md` Wave 1 target).

---

## Test results

```bash
npm run test:pg
```

| Metric | Value |
|---|---|
| Total tests | 1790 |
| Pass | 1788 |
| Fail | 2 (pre-existing, unrelated to Room OS) |
| Duration | ~28s |

**All Room OS suites green** (18 suites):

- Room OS architecture guards
- Wave 0, Wave 1 (Electricity, Ledger, Occupancy, Property, WorkQueue)
- Wave 2 (Benchmark, Certification, Feature flag rollback, Integrity, Materialization freshness, Operations parity, Outbox processor, Property Index, Work Queue, Writer Outbox, Operations Centre migration)

**Unrelated failures** (not introduced by Wave 2 completion):

- `billingCentreDashboardPresentation.test.ts` — filter assertion
- `residentRejectedBill.test.ts` — Due vs Overdue label

---

## Rollback procedure

1. **Immediate:** Set `ROOM_OS_OPERATIONS_QUEUE=0` (or unset) — legacy Operations Centre path restored instantly.
2. **Verify:** Run `npm run cert:room-os-wave2` — portal parity + 8-check cert must not `fail`.
3. **Ops parity:** `npx tsx scripts/run-room-os-ops-parity-audit.ts` — shared tabs must match.
4. **Outbox:** Cron continues draining; materialized rows remain valid read cache (no writes required for rollback).

Parity audit uses `forceSource: 'legacy' | 'room_os'` — no env toggling during comparison.

---

## Wave 3 deferrals (explicitly out of scope)

- RFE via Bed Brain; legacy composer sunset; forbidden-import lint
- Billing Centre migration
- Remaining Operations Centre tabs (payment reviews, deposits, move-out, etc.)
- Replay / Explain modules
- New engines, projectors, or event types
- `loadBookingContext` stub implementation
- Enabling `ROOM_OS_OPERATIONS_QUEUE=1` in production

---

## Sign-off checklist

- [x] Outbox processor wired (cron + post-deploy + drain)
- [x] Retry columns + backoff + metrics
- [x] Certification in release pipeline
- [x] Ops parity audit service + CLI
- [x] Materialization freshness audit + CLI
- [x] Benchmark script + npm script
- [x] Feature-flag rollback tests
- [x] Architecture guards extended
- [x] Unit tests for all Wave 2 completion modules
- [ ] Benchmark numbers captured against staging/production DB (ops step)
- [ ] Live cert run against staging/production DB (ops step)
- [ ] Production flag cutover decision (ops step)
