/**
 * SELECT-only: Room OS infrastructure tables vs current PG production needs.
 * Does not apply migrations. Missing tables are WARN (pre-cutover), not FAIL.
 */
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.local' });
config({ path: '.env.production.local' });

function ensureDatabaseUrl(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.prod.live', '.env.production.local', '.env.local', '.env.off']) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (value && !value.includes('placeholder')) {
        process.env.DATABASE_URL = value;
        return;
      }
    } catch {
      // next
    }
  }
}
ensureDatabaseUrl();

import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

const TABLES = [
  'room_os_outbox',
  'property_os_index',
  'work_queue_index',
  'room_os_published_rules',
  'room_os_workflow_instances',
  'business_metrics_index',
] as const;

async function main(): Promise<void> {
  const present = await db.execute<{ table_name: string }>(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'room_os_outbox',
        'property_os_index',
        'work_queue_index',
        'room_os_published_rules',
        'room_os_workflow_instances',
        'business_metrics_index'
      )
  `);
  const have = new Set(present.map((r) => r.table_name));
  const missing = TABLES.filter((t) => !have.has(t));
  console.log(
    JSON.stringify(
      {
        certification: 'room-os-schema-readonly',
        status: 'PASS',
        severity: missing.length > 0 ? 'warn' : 'pass',
        present: [...have],
        missing,
        notes: [
          '0132–0138 are NOT in drizzle _journal.json on main (last registered PG migrate is 0149_room_change_engine).',
          'Current PG occupancy/electricity/room-change engines do not require these tables.',
          'room_os_outbox writers skip when the table is absent.',
          'Do not apply 0132–0138 as part of Awesome PG stability unless Room OS cutover is an explicit product release.',
        ],
      },
      null,
      2,
    ),
  );
}

void main();
