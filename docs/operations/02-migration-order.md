# Room OS Migration Order

Apply migrations in numeric order. Room OS requires migrations **0132 through 0138** inclusive.

## Execution

```bash
DATABASE_URL=<target-db-url> npm run db:migrate
```

Migration runner: `src/db/migrate.ts`

## Ordered migrations

| Order | File | Table / change | Wave | Depends on |
|-------|------|----------------|------|------------|
| 1 | `0132_room_os_outbox.sql` | `room_os_outbox` | 0 | — |
| 2 | `0133_property_os_index.sql` | `property_os_index` | 2 | 0132 (outbox feeds projector) |
| 3 | `0134_work_queue_index.sql` | `work_queue_index` | 2 | 0133 |
| 4 | `0135_room_os_outbox_retry.sql` | `room_os_outbox.attempt_count`, `next_retry_at` | 2 | 0132 |
| 5 | `0136_room_os_published_rules.sql` | `room_os_published_rules` | 5 | — |
| 6 | `0137_room_os_workflow_instances.sql` | `room_os_workflow_instances` | 6 | — |
| 7 | `0138_business_metrics_index.sql` | `business_metrics_index` | 6 | 0133, 0134 |

Migrations 0130 and 0131 are unrelated to Room OS (collections ops, electricity tracking). They may already exist; do not skip them if pending in your migration journal.

## Verify after apply

```sql
-- Outbox
SELECT count(*) FROM room_os_outbox;

-- Materialized indexes
SELECT count(*) FROM property_os_index;
SELECT count(*) FROM work_queue_index;
SELECT count(*) FROM business_metrics_index;

-- Workflow (Wave 6)
SELECT count(*) FROM room_os_workflow_instances;

-- Retry columns (0135)
SELECT column_name FROM information_schema.columns
WHERE table_name = 'room_os_outbox' AND column_name IN ('attempt_count', 'next_retry_at');
```

Expected: all tables exist; retry columns present; row counts may be zero before first ledger activity and outbox drain.

## Post-migration materialization

After migrations, outbox rows are created by ledger writers. Projectors materialize indexes via cron:

1. Ledger write → `property_index.rebuild_requested` in outbox
2. Cron drain → PropertyProjector → `property_os_index`
3. Same event → WorkQueueProjector → `work_queue_index` → `business_metrics_index`

Until cron runs, read APIs may return `live_fallback` status. This is expected pre-cutover.

## Rollback note

**Do not drop Room OS tables in production rollback.** Flag rollback (see [05-rollback-procedure.md](./05-rollback-procedure.md)) restores legacy read paths instantly without schema changes.
