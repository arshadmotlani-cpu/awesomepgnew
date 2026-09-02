/**
 * SELECT-only occupancy / room-change hold certification.
 * No INSERT/UPDATE/DELETE.
 */
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';

config({ path: '.env' });
config({ path: '.env.local' });
config({ path: '.env.production.local' });

function ensureDatabaseUrl(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.prod.live', '.env.production.local', '.env.local']) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      if (match?.[1]?.trim() && !match[1].includes('placeholder')) {
        process.env.DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');
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

type Row = { issue: string; n: number };

async function hasColumn(table: string, column: string): Promise<boolean> {
  const rows = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = ${table} AND column_name = ${column}
    ) AS exists
  `);
  return Boolean(rows[0]?.exists);
}

async function main(): Promise<void> {
  const hasWorkflow = await hasColumn('room_change_requests', 'workflow_state');
  const hasHoldExpiry = await hasColumn('room_transfer_bed_holds', 'expires_at');

  const duplicateOpen = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM (
      SELECT booking_id
      FROM room_change_requests
      WHERE status IN ('draft', 'submitted', 'approved', 'waiting')
      GROUP BY booking_id
      HAVING count(*) > 1
    ) d
  `);

  const activeHolds = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n
    FROM room_transfer_bed_holds
    WHERE status = 'active'
  `);

  const rows: Row[] = [
    { issue: 'duplicate_open_requests_per_booking', n: Number(duplicateOpen[0]?.n ?? 0) },
    { issue: 'active_transfer_holds', n: Number(activeHolds[0]?.n ?? 0) },
  ];

  const fail = rows.filter((r) => r.issue === 'duplicate_open_requests_per_booking' && r.n > 0);
  console.log(
    JSON.stringify(
      {
        certification: 'room-change-occupancy-readonly',
        schema: { workflow_state: hasWorkflow, hold_expires_at: hasHoldExpiry },
        status: fail.length === 0 ? 'PASS' : 'FAIL',
        failCount: fail.length,
        notes: [
          '0149 not yet applied in production if workflow_state=false.',
          'duplicate_open_requests_per_booking must be 0 before 0149 unique index.',
          'Active holds are informational; they must not appear as public Available (app SSOT).',
        ],
        rows,
      },
      null,
      2,
    ),
  );
  process.exitCode = fail.length > 0 ? 1 : 0;
}

void main();
