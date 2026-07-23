#!/usr/bin/env npx tsx
/** Fast production queue source counts — no full unified queue build. */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import { closeDb, db } from '@/src/db/client';
import { sql } from 'drizzle-orm';

loadProductionAuditEnv();
requireDatabaseUrl('verify-operations-queue-fast.ts');

async function main() {
  const [pendingProofs] = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n FROM pg_payment_records
    WHERE status = 'pending'
      AND payment_screenshot_url IS NOT NULL
      AND trim(payment_screenshot_url) <> ''
  `);

  const [bookingApproval] = await db.execute<{ n: number }>(sql`
    SELECT COUNT(DISTINCT b.id)::int AS n
    FROM bookings b
    INNER JOIN bed_reservations br ON br.booking_id = b.id
    WHERE b.status = 'pending_approval'
      AND b.duration_mode::text <> 'reserve'
      AND NOT EXISTS (
        SELECT 1 FROM pg_payment_records ppr
        WHERE ppr.booking_id = b.id
          AND ppr.status = 'pending'
          AND ppr.payment_screenshot_url IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_payment_records ppr
        WHERE ppr.booking_id = b.id
          AND ppr.status = 'approved'
          AND ppr.payment_screenshot_url IS NOT NULL
      )
  `);

  const [openPaymentActions] = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n FROM action_items
    WHERE type = 'payment_received'
      AND status IN ('open', 'in_progress')
  `);

  const [confirmedPendingProofs] = await db.execute<{ n: number; ids: string }>(sql`
    SELECT COUNT(*)::int AS n,
           string_agg(pr.id::text, ', ') AS ids
    FROM pg_payment_records pr
    INNER JOIN bookings b ON b.id = pr.booking_id
    WHERE pr.status = 'pending'
      AND pr.payment_screenshot_url IS NOT NULL
      AND b.status IN ('confirmed', 'completed')
  `);

  const [vacatingOpen] = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n FROM vacating_requests
    WHERE status IN ('pending', 'approved', 'in_progress')
      AND NOT is_cancelled
  `);

  console.log(JSON.stringify({
    pendingPaymentProofs: pendingProofs?.n ?? 0,
    bookingApprovalCandidates: bookingApproval?.n ?? 0,
    openPaymentReceivedActions: openPaymentActions?.n ?? 0,
    stalePendingProofsOnConfirmedBookings: confirmedPendingProofs?.n ?? 0,
    staleProofIds: confirmedPendingProofs?.ids ?? '',
    openVacatingRequests: vacatingOpen?.n ?? 0,
  }, null, 2));

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
