/* eslint-disable no-console */
/** Read-only: recent audit_log rows for manual_occupied set/clear. */
import { sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('forensic-manual-occupied-audit-readonly.ts');

async function main() {
  const { closeDb, db } = await import('../src/db/client');
  const rows = await db.execute<{
    created_at: string;
    actor_type: string;
    actor_id: string | null;
    entity_id: string;
    action: string;
    pg_name: string | null;
    bed_code: string | null;
    from_val: string | null;
    to_val: string | null;
  }>(sql`
    SELECT created_at, actor_type, actor_id::text, entity_id::text, action,
           diff->>'pgName' AS pg_name, diff->>'bedCode' AS bed_code,
           diff->>'from' AS from_val, diff->>'to' AS to_val
    FROM audit_log
    WHERE entity = 'bed'
      AND action IN ('manual_occupied_cleared', 'manual_occupied_set')
    ORDER BY created_at DESC
    LIMIT 50
  `);
  console.log('Recent manual_occupied audit rows:', rows.length);
  for (const r of rows) {
    console.log(
      `${r.created_at}\t${r.actor_type}\t${r.action}\t${r.pg_name ?? '?'}\t${r.bed_code ?? '?'}\t${r.from_val}->${r.to_val}`,
    );
  }
  const silent = await db.execute<{ cnt: string }>(sql`
    SELECT count(*)::text AS cnt FROM beds
    WHERE manual_occupied = true AND archived_at IS NULL
  `);
  console.log('Current manual_occupied=true beds:', silent[0]?.cnt ?? '0');
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
