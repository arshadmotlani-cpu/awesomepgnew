#!/usr/bin/env npx tsx
/**
 * Legacy data repair — APG-2026-0083 half deposit (parity with APG-2026-0082).
 *
 * Proof / payment evidence: ₹6,180 (618000 paise) → rent ₹4,121 + deposit ₹2,059.
 * Ledger was incorrectly credited full contract deposit (412080) via verificationOnly path.
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/repair-0083-partial-deposit-ledger.ts
 *   USE_PRODUCTION_DB=1 npx tsx scripts/repair-0083-partial-deposit-ledger.ts --execute
 *
 * Requires REPAIR_ADMIN_ID (admin UUID for audit) or uses 0082 partial-deposit approver.
 */
import { eq, sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('repair-0083-partial-deposit-ledger.ts');

import { closeDb, db } from '@/src/db/client';
import { auditLog, bookings } from '@/src/db/schema';
import { splitBookingPayment } from '@/src/services/depositCollection';
import {
  adjustDepositCollectedBalance,
  getDepositSummaryForBooking,
} from '@/src/services/deposits';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import { loadVacatingBillingPresentationBundle } from '@/src/lib/vacating/loadVacatingBillingPresentation';
import { paiseToInr } from '@/src/lib/format';

const BOOKING_CODE = 'APG-2026-0083';
const PROOF_RECEIVED_PAISE = 618_000;
const TARGET_COLLECTED_PAISE = 205_900;
const REASON =
  'legacy_APG-2026-0083_half_deposit: proof ₹6180 matches APG-2026-0082; correct over-credited deposit';

const execute = process.argv.includes('--execute');

async function resolveAdminId(): Promise<string> {
  if (process.env.REPAIR_ADMIN_ID?.trim()) {
    return process.env.REPAIR_ADMIN_ID.trim();
  }
  const rows = await db.execute<{ admin_id: string }>(sql`
    SELECT created_by_admin_id::text AS admin_id
    FROM deposit_ledger
    WHERE booking_id = (SELECT id FROM bookings WHERE booking_code = 'APG-2026-0082' LIMIT 1)
      AND entry_kind = 'collected'
      AND created_by_admin_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const id = rows[0]?.admin_id;
  if (!id) {
    throw new Error('Set REPAIR_ADMIN_ID — no admin id on APG-2026-0082 deposit ledger.');
  }
  return id;
}

async function main() {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.bookingCode, BOOKING_CODE))
    .limit(1);

  if (!booking) {
    console.error('Booking not found:', BOOKING_CODE);
    process.exit(1);
  }

  const split = splitBookingPayment(booking, PROOF_RECEIVED_PAISE);
  const adminId = await resolveAdminId();

  const summaryBefore = await getDepositSummaryForBooking(booking.id);
  const balancesBefore = await getBookingMoneyBalances(booking.id);

  console.log('=== APG-2026-0083 legacy deposit repair (preview) ===\n');
  console.log('Booking:', booking.id, booking.bookingCode);
  console.log('Proof received (paise):', PROOF_RECEIVED_PAISE, paiseToInr(PROOF_RECEIVED_PAISE));
  console.log('Split from proof:', split);
  const effectiveHeldPaise =
    summaryBefore?.refundableBalancePaise ?? summaryBefore?.collectedPaise ?? 0;

  console.log('Effective deposit held (refundable, paise):', effectiveHeldPaise, paiseToInr(effectiveHeldPaise));
  console.log('Ledger before:', {
    collected: summaryBefore?.collectedPaise,
    refundable: summaryBefore?.refundableBalancePaise,
    entries: summaryBefore?.entries?.map((e) => ({
      kind: e.entryKind,
      amount: e.amountPaise,
      reason: e.reason,
    })),
  });
  console.log('Booking before:', {
    deposit_collection_status: booking.depositCollectionStatus,
    deposit_due_paise: booking.depositDuePaise,
  });
  console.log('Money balances before:', balancesBefore?.deposit);
  console.log('Repair admin id:', adminId);
  console.log('Ledger delta (to target held):', TARGET_COLLECTED_PAISE - effectiveHeldPaise);

  const ledgerAtTarget = effectiveHeldPaise === TARGET_COLLECTED_PAISE;

  if (ledgerAtTarget) {
    console.log('\nDeposit held already at target — skipping ledger adjustment.');
  } else if (!execute) {
    console.log('\nDry run. Pass --execute to append deductive ledger entry + booking partial fields.');
    await closeDb();
    return;
  }

  if (execute && !ledgerAtTarget) {
    const adj = await adjustDepositCollectedBalance({
      bookingId: booking.id,
      customerId: booking.customerId,
      targetCollectedPaise: TARGET_COLLECTED_PAISE,
      reason: REASON,
      createdByAdminId: adminId,
    });
    if (!adj.ok) {
      console.error('adjustDepositCollectedBalance failed:', adj.error);
      process.exit(1);
    }
    console.log('\nLedger adjustment applied, delta paise:', adj.ledgerDelta);
  }

  if (execute) {
    const depositDuePaise = split.depositDuePaise;
    const depositDueDate =
      booking.depositDueDate ??
      (() => {
        const d = new Date('2026-08-21T00:00:00.000Z');
        return d.toISOString().slice(0, 10);
      })();

    const bookingNeedsUpdate =
      booking.depositCollectionStatus !== 'partial' ||
      booking.depositDuePaise !== depositDuePaise;

    if (bookingNeedsUpdate) {
      await db
        .update(bookings)
        .set({
          depositCollectionStatus: 'partial',
          depositDuePaise: depositDuePaise,
          depositDueDate,
          depositDueApprovedByAdminId: adminId,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, booking.id));
    }

    if (!ledgerAtTarget || bookingNeedsUpdate) {
      await db.insert(auditLog).values({
        actorType: 'admin',
        actorId: adminId,
        entity: 'booking',
        entityId: booking.id,
        action: 'legacy_deposit_repair_0083',
        diff: {
          bookingCode: BOOKING_CODE,
          proofReceivedPaise: PROOF_RECEIVED_PAISE,
          targetDepositCollectedPaise: TARGET_COLLECTED_PAISE,
          depositDuePaise: depositDuePaise,
          depositDueDate,
          priorCollectedPaise: summaryBefore?.collectedPaise ?? null,
          priorRefundablePaise: summaryBefore?.refundableBalancePaise ?? null,
          priorDepositCollectionStatus: booking.depositCollectionStatus,
          priorDepositDuePaise: booking.depositDuePaise,
          reason: REASON,
          referenceBookingCode: 'APG-2026-0082',
        },
      });

      if (bookingNeedsUpdate) {
        await db.insert(auditLog).values({
          actorType: 'admin',
          actorId: adminId,
          entity: 'booking',
          entityId: booking.id,
          action: 'partial_deposit_approved',
          diff: {
            depositDuePaise: depositDuePaise,
            depositDueDate,
            legacyRepair: true,
            note: 'Backfilled after legacy_deposit_repair_0083',
          },
        });
      }
    }
  }

  const summaryAfter = await getDepositSummaryForBooking(booking.id);
  const balancesAfter = await getBookingMoneyBalances(booking.id);

  const [v] = await db.execute<{ notice_given_date: string; vacating_date: string; monthly: number }>(sql`
    SELECT notice_given_date::text, vacating_date::text,
           monthly_rent_paise_snapshot::bigint::int AS monthly
    FROM vacating_requests
    WHERE booking_id = ${booking.id}::uuid AND status <> 'rejected'
    ORDER BY created_at DESC LIMIT 1
  `);

  let estimatedRefund: number | null = null;
  if (v) {
    const bundle = await loadVacatingBillingPresentationBundle({
      bookingId: booking.id,
      noticeGivenDate: v.notice_given_date,
      vacatingDate: v.vacating_date,
      monthlyRentPaiseSnapshot: v.monthly,
      stayType: booking.stayType,
      durationMode: booking.durationMode,
      mode: 'estimate',
      treatAsApprovedForTail: true,
    });
    estimatedRefund = bundle?.estimatedSettlement?.estimatedRefundPaise ?? null;
  }

  console.log('\n=== After ===');
  console.log('Ledger:', {
    collected: summaryAfter?.collectedPaise,
    refundable: summaryAfter?.refundableBalancePaise,
    entries: summaryAfter?.entries?.map((e) => ({
      kind: e.entryKind,
      amount: e.amountPaise,
      reason: e.reason,
    })),
  });
  console.log('Money balances deposit:', balancesAfter?.deposit);
  console.log('Estimated settlement refund (paise):', estimatedRefund, estimatedRefund != null ? paiseToInr(estimatedRefund) : '—');

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
