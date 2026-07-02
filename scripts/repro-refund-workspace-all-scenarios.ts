/**
 * Full refund workspace resilience test against production-shaped data.
 * Usage: DATABASE_URL=... npx tsx scripts/repro-refund-workspace-all-scenarios.ts
 */
import { config } from 'dotenv';
config({ path: '.env.bak' });
config({ path: '.env.local' });

import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { toRefundConsoleWorkspaceDTO } from '../src/lib/refund/refundConsoleDto';
import { getRefundConsoleWorkspace } from '../src/services/refundConsole';

type Scenario = { label: string; bookingId: string };

async function scenarios(): Promise<Scenario[]> {
  const out: Scenario[] = [];

  const refundDue = await db.execute<{ id: string }>(sql`
    SELECT DISTINCT b.id
    FROM bookings b
    LEFT JOIN checkout_settlements cs ON cs.booking_id = b.id AND cs.status = 'refund_pending'
    WHERE cs.id IS NOT NULL
    LIMIT 10
  `);
  for (const r of refundDue) out.push({ label: 'refund_pending checkout', bookingId: r.id });

  const noLedger = await db.execute<{ id: string }>(sql`
    SELECT b.id FROM bookings b
    LEFT JOIN deposit_ledger dl ON dl.booking_id = b.id
    WHERE dl.id IS NULL AND b.is_test = false
    LIMIT 10
  `);
  for (const r of noLedger) out.push({ label: 'no ledger', bookingId: r.id });

  const withLedger = await db.execute<{ id: string }>(sql`
    SELECT DISTINCT b.id FROM bookings b
    INNER JOIN deposit_ledger dl ON dl.booking_id = b.id
    LIMIT 10
  `);
  for (const r of withLedger) out.push({ label: 'has ledger', bookingId: r.id });

  const withTransfer = await db.execute<{ id: string }>(sql`
    SELECT DISTINCT booking_id AS id FROM deposit_ledger
    WHERE entry_kind = 'deducted' AND reason ILIKE '%transfer%'
    LIMIT 10
  `);
  for (const r of withTransfer) out.push({ label: 'transfer history', bookingId: r.id });

  const noCheckout = await db.execute<{ id: string }>(sql`
    SELECT b.id FROM bookings b
    LEFT JOIN checkout_settlements cs ON cs.booking_id = b.id
    WHERE cs.id IS NULL AND b.is_test = false
    LIMIT 10
  `);
  for (const r of noCheckout) out.push({ label: 'no checkout', bookingId: r.id });

  const harshal = await db.execute<{ id: string }>(sql`
    SELECT b.id FROM bookings b
    JOIN customers c ON c.id = b.customer_id
    WHERE c.full_name ILIKE '%harshal%'
    LIMIT 5
  `);
  for (const r of harshal) out.push({ label: 'harshal', bookingId: r.id });

  const seen = new Set<string>();
  return out.filter((s) => {
    if (seen.has(s.bookingId)) return false;
    seen.add(s.bookingId);
    return true;
  });
}

async function exercise(label: string, bookingId: string) {
  const workspace = await getRefundConsoleWorkspace(bookingId);
  if (!workspace) throw new Error(`null workspace (${label})`);
  const dto = toRefundConsoleWorkspaceDTO(workspace);
  JSON.parse(JSON.stringify(dto));
  structuredClone(dto);
}

async function main() {
  const list = await scenarios();
  console.log(`Running ${list.length} scenarios…\n`);
  let ok = 0;
  for (const s of list) {
    try {
      await exercise(s.label, s.bookingId);
      ok += 1;
      console.log(`OK  [${s.label}] ${s.bookingId}`);
    } catch (err) {
      console.error(`\n========== FAIL [${s.label}] ${s.bookingId} ==========`);
      if (err instanceof Error) {
        console.error(err.message);
        console.error(err.stack);
      } else {
        console.error(err);
      }
      process.exit(1);
    }
  }
  console.log(`\n✓ ${ok}/${list.length} scenarios passed`);
}

main().catch((err) => {
  console.error('Fatal', err);
  process.exit(1);
});
