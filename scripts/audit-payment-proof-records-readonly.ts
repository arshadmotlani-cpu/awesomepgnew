#!/usr/bin/env npx tsx
/**
 * Read-only classification of payment proof records (Classes A–F).
 *
 *   npx tsx scripts/audit-payment-proof-records-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import { sql } from 'drizzle-orm';
import { createClient } from '@/src/db/client';

loadProductionAuditEnv();
requireDatabaseUrl('audit-payment-proof-records-readonly.ts');

type ProofClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

type Row = {
  source: string;
  id: string;
  status: string;
  txn_ref: string | null;
  proof_url: string | null;
  booking_code: string | null;
};

function classify(row: Row): ProofClass {
  const hasTxn = Boolean(row.txn_ref?.trim());
  const hasUrl = Boolean(row.proof_url?.trim());
  if (row.status === 'paid' || row.status === 'approved') return 'B';
  if (hasTxn && (row.status === 'pending' || row.status === 'payment_in_progress' || row.status === 'active')) {
    return 'A';
  }
  if (!hasTxn && !hasUrl) return 'C';
  if (!hasTxn && hasUrl) return 'D';
  return 'E';
}

async function main() {
  const { db, close } = createClient({ max: 1 });
  const rows = await db.execute<Row>(sql`
    SELECT 'rent' AS source, ri.id::text, ri.status::text, ri.payment_proof_transaction_ref AS txn_ref,
           ri.payment_proof_url AS proof_url, b.booking_code
    FROM rent_invoices ri
    LEFT JOIN bookings b ON b.id = ri.booking_id
    WHERE ri.status IN ('pending','payment_in_progress','overdue')
    UNION ALL
    SELECT 'deposit_link', pl.id::text, pl.status::text, pl.payment_proof_transaction_ref,
           pl.payment_proof_url, b.booking_code
    FROM payment_links pl
    LEFT JOIN bookings b ON b.id = pl.booking_id
    WHERE pl.status = 'active'
    UNION ALL
    SELECT 'qr', pr.id::text, pr.status::text, pr.transaction_ref,
           pr.payment_screenshot_url, b.booking_code
    FROM pg_payment_records pr
    LEFT JOIN bookings b ON b.id = pr.booking_id
    WHERE pr.status = 'pending'
  `);
  await close();

  const summary: Record<ProofClass, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
  const samples: Partial<Record<ProofClass, Row[]>> = {};
  for (const row of rows) {
    const c = classify(row);
    summary[c] += 1;
    samples[c] = samples[c] ?? [];
    if ((samples[c]?.length ?? 0) < 5) samples[c]!.push(row);
  }

  const orphaned = await (async () => {
    const { db: db2, close: close2 } = createClient({ max: 1 });
    const r = await db2.execute<{ ref: string }>(sql`
      SELECT atr.transaction_ref_normalized AS ref
      FROM pg_approved_transaction_refs atr
      LEFT JOIN rent_invoices ri ON ri.payment_proof_transaction_ref = atr.transaction_ref_normalized
      LEFT JOIN payment_links pl ON pl.payment_proof_transaction_ref = atr.transaction_ref_normalized
      WHERE ri.id IS NULL AND pl.id IS NULL
      LIMIT 20
    `);
    await close2();
    summary.F = r.length;
    return r;
  })();

  console.log(JSON.stringify({ summary, samples, orphanedRefs: orphaned }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
