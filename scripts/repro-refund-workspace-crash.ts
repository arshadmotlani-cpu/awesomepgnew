/**
 * Reproduce refund workspace load failures with full stack traces.
 * Usage: DATABASE_URL=... npx tsx scripts/repro-refund-workspace-crash.ts [query]
 */
import { config } from 'dotenv';
config({ path: '.env.bak' });
config({ path: '.env.local' });
config({ path: '.env' });

import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { toRefundConsoleWorkspaceDTO } from '../src/lib/refund/refundConsoleDto';
import {
  getRefundConsoleWorkspace,
  searchRefundConsoleBookings,
} from '../src/services/refundConsole';

async function loadBookingIds(query?: string): Promise<string[]> {
  if (query?.trim()) {
    const result = await searchRefundConsoleBookings(query.trim(), 50);
    return result.rows.map((r) => r.bookingId);
  }

  const rows = await db.execute<{ id: string }>(sql`
    SELECT b.id
    FROM bookings b
    WHERE b.is_test = false
    ORDER BY b.updated_at DESC
    LIMIT 80
  `);
  return rows.map((r) => r.id);
}

async function exerciseBooking(bookingId: string, bookingCode?: string) {
  const workspace = await getRefundConsoleWorkspace(bookingId);
  if (!workspace) {
    return { bookingId, bookingCode, stage: 'null-workspace' as const };
  }
  const dto = toRefundConsoleWorkspaceDTO(workspace);
  const serialized = JSON.parse(JSON.stringify(dto));
  // Simulate Next.js server action + RSC prop boundary
  structuredClone(dto);
  return { bookingId, bookingCode, stage: 'ok' as const, serialized };
}

async function main() {
  const query = process.argv[2];
  const ids = await loadBookingIds(query);
  console.log(`Testing ${ids.length} booking(s)${query ? ` for "${query}"` : ''}…\n`);

  let ok = 0;
  let failed = 0;

  for (const bookingId of ids) {
    try {
      const result = await exerciseBooking(bookingId);
      if (result.stage === 'ok') {
        ok += 1;
      } else {
        console.log('NULL workspace', bookingId);
      }
    } catch (err) {
      failed += 1;
      console.error('\n========== CRASH ==========');
      console.error('bookingId:', bookingId);
      if (err instanceof Error) {
        console.error('message:', err.message);
        console.error(err.stack);
      } else {
        console.error(err);
      }
    }
  }

  console.log(`\n${ok} ok, ${failed} crashed, ${ids.length - ok - failed} null`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
