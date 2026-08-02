# Room OS Disaster Recovery

Procedures for outbox backlog, dead-letter replay, stale materialization rebuild, and database restore.

## Severity guide

| Scenario | Severity | First action |
|----------|----------|--------------|
| Dead-letter rows > 0 | Critical | § Dead-letter replay |
| Pending > 100 for > 30 min | High | § Outbox backlog |
| Materialization age > 24 h | High | § Stale materialization rebuild |
| Flags on + ops parity FAIL | Critical | [05-rollback-procedure.md](./05-rollback-procedure.md) |
| Full DB restore | Critical | § Database restore |

---

## Outbox backlog

**Symptoms:** `pendingRemaining` high; `oldestPendingAgeMs` increasing; cron runs but backlog flat.

### 1. Confirm cron is running

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://<domain>/api/cron/room-os-outbox" | jq .
```

Check Vercel cron logs for 401/500.

### 2. Manual extended drain

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://<domain>/api/cron/room-os-outbox?batchSize=100&maxBatches=50" | jq .
```

Repeat until `pendingRemaining` ≤ 50.

### 3. Identify stuck events

Query (read-only):

```sql
SELECT id, event_type, status, attempt_count, next_retry_at, created_at
FROM room_os_outbox
WHERE status IN ('pending', 'failed')
ORDER BY created_at ASC
LIMIT 20;
```

### 4. If backlog persists

- Check application logs for projector errors during drain
- Verify migrations 0132–0138 applied
- Consider temporary flag rollback if user-facing impact

---

## Dead-letter replay

**Symptoms:** `deadLetter > 0` in cron response or production audit FAIL.

Dead-letter = rows with `status = 'failed'` and `attempt_count >= 5` (max retries exhausted).

### 1. Inspect dead-letter rows

```sql
SELECT id, event_type, payload, last_error, attempt_count, created_at
FROM room_os_outbox
WHERE status = 'failed' AND attempt_count >= 5
ORDER BY created_at DESC;
```

### 2. Fix root cause

Common causes:

- Missing migration (table/column not found)
- Invalid payload after schema change
- Transient DB timeout (may be safe to replay)

### 3. Replay (after fix)

Reset row for retry (requires DBA approval):

```sql
UPDATE room_os_outbox
SET status = 'pending',
    attempt_count = 0,
    next_retry_at = NULL,
    last_error = NULL
WHERE id = '<outbox-id>';
```

Then trigger drain:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://<domain>/api/cron/room-os-outbox?batchSize=50&maxBatches=20"
```

### 4. Verify

- `deadLetter = 0`
- Materialization audit PASS
- Affected PG data correct in Operations Centre

**Do not** bulk-reset dead-letter rows without understanding `last_error`.

---

## Stale materialization rebuild

**Symptoms:** Materialization audit FAIL (age > 24 h); sustained `live_fallback` API status.

### 1. Confirm outbox is healthy

Dead-letter and backlog must be resolved first.

### 2. Run materialization audit

```bash
DATABASE_URL=<prod> npx tsx scripts/run-room-os-materialization-audit.ts
```

Note which index is stale: property, work_queue, or business_metrics.

### 3. Trigger rebuild via outbox

Materialization rebuilds happen when outbox events are processed. If events were missed:

- Identify affected `property_id` / billing month from audit output
- Replay relevant ledger events (see dead-letter section) OR
- Run targeted rebuild scripts if available in ops tooling

### 4. Verify freshness

Re-run audit; all ages should be < 6 h after successful drain cycle.

### 5. Ops parity check

```bash
DATABASE_URL=<prod> npx tsx scripts/run-room-os-ops-parity-audit.ts
```

---

## Database restore

**Symptoms:** Data loss, corruption, or need to revert to pre-migration state.

### Important constraints

- **Do not roll back migrations 0132–0138** in production under normal circumstances
- Room OS flags default **off** — legacy path works without materialized data
- Restoring DB snapshot **before** migrations requires coordinated code rollback (not recommended)

### Recommended restore procedure

1. **Immediate:** Set `ROOM_OS_OPERATIONS_QUEUE=0` and `ROOM_OS_BILLING_CENTRE=0`
2. Restore DB from latest backup **after** migrations 0132–0138 were applied
3. Redeploy current application version
4. Run [08-smoke-tests.md](./08-smoke-tests.md) full suite
5. Drain outbox to rebuild materializations from ledger
6. Re-enable flags only after parity PASS

### Post-restore outbox state

After restore, outbox may contain events already processed in backup. Drain idempotency should handle duplicates; monitor for dead-letter.

---

## Communication template

```
INCIDENT: Room OS [outbox backlog | dead-letter | stale materialization]
SEVERITY: [Critical | High]
FLAGS: OPS=[on/off] BILLING=[on/off]
METRICS: pending=X deadLetter=Y oldestPending=Zmin
ACTION: [drain | replay | rollback | rebuild]
STATUS: [investigating | mitigating | resolved]
```

---

## Related runbooks

- [05-rollback-procedure.md](./05-rollback-procedure.md) — instant flag rollback
- [07-alerts.md](./07-alerts.md) — alert thresholds
- [11-production-runbook.md](./11-production-runbook.md) — incident response
