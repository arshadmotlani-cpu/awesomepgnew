/**
 * READ-ONLY: duplicate transaction ref review context for a booking + UTR.
 * USE_PRODUCTION_DB=1 npx tsx scripts/verify-duplicate-txn-ref-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('verify-duplicate-txn-ref');

const BOOKING_CODE = process.env.BOOKING_CODE ?? 'APG-2026-0025';
const TXN_REF = process.env.TXN_REF ?? '502313729205';

async function main() {
  const { sql } = await import('drizzle-orm');
  const { closeDb, db } = await import('@/src/db/client');
  const { resolveDuplicateTransactionRefReviewContext } = await import(
    '@/src/services/pgTransactionRefIndex'
  );
  const { enrichDuplicateTransactionRefReviewContext } = await import(
    '@/src/services/duplicateTransactionRefAdminDisplay'
  );

  function rows<T>(r: unknown): T[] {
    if (Array.isArray(r)) return r as T[];
    return ((r as { rows?: T[] })?.rows ?? []) as T[];
  }

  const pending = rows<{
    kind: string;
    entity_id: string;
    status: string;
    transaction_ref: string | null;
  }>(
    await db.execute(sql`
      SELECT 'qr' AS kind, pr.id::text AS entity_id, pr.status::text, pr.transaction_ref
      FROM pg_payment_records pr
      JOIN bookings b ON b.id = pr.booking_id
      WHERE b.booking_code = ${BOOKING_CODE}
        AND lower(trim(pr.transaction_ref)) = lower(trim(${TXN_REF}))
        AND pr.status = 'pending'
      UNION ALL
      SELECT 'rent', ri.id::text, ri.status::text, ri.payment_proof_transaction_ref
      FROM rent_invoices ri
      JOIN bookings b ON b.id = ri.booking_id
      WHERE b.booking_code = ${BOOKING_CODE}
        AND lower(trim(ri.payment_proof_transaction_ref)) = lower(trim(${TXN_REF}))
        AND ri.status IN ('payment_in_progress', 'pending')
      LIMIT 5
    `),
  );

  console.log('Booking:', BOOKING_CODE, 'Txn ref:', TXN_REF);
  console.log('Pending submissions with this ref:', pending.length);
  for (const row of pending) {
    console.log(' —', row.kind, row.entity_id, row.status);
  }

  const globalCtx = await resolveDuplicateTransactionRefReviewContext({
    transactionRef: TXN_REF,
  });
  const enriched = await enrichDuplicateTransactionRefReviewContext(globalCtx);
  console.log('\nGlobal duplicate context:');
  console.log(' requiresOverride:', enriched.requiresOverride);
  console.log(' registry conflicts:', enriched.approvedRegistryConflicts.length);
  console.log(' cross matches:', enriched.crossMatches.length);
  for (const c of enriched.conflicts) {
    console.log('  conflict:', {
      paymentId: c.paymentId,
      resident: c.residentName,
      booking: c.bookingCode,
      amount: c.amountPaise,
      purpose: c.purposeLabel,
      approvedAt: c.approvedAt,
    });
  }

  if (pending[0]) {
    const kind = pending[0].kind as 'qr' | 'rent';
    const { reviewKindToTxnSourceKind } = await import('@/src/services/pgTransactionRefIndex');
    const itemCtx = await resolveDuplicateTransactionRefReviewContext({
      transactionRef: TXN_REF,
      exclude: { kind: reviewKindToTxnSourceKind(kind), id: pending[0].entity_id },
    });
    const itemEnriched = await enrichDuplicateTransactionRefReviewContext(itemCtx);
    console.log('\nPending item review context (exclude self):');
    console.log(' requiresOverride:', itemEnriched.requiresOverride);
    console.log(' UI would show Approve anyway:', itemEnriched.requiresOverride);
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
