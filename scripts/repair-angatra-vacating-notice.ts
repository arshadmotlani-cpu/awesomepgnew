/* eslint-disable no-console */
/**
 * Restore / repair Angatra Mandal (APG-2026-0013) vacating request from audit trail.
 *
 * Production row was deleted on cancel (2026-08-20T12:08:02Z) after submit at 12:07:01Z.
 * Restores immutable originalNoticeSubmittedAt and recomputes settlement from that date.
 *
 *   npx tsx scripts/repair-angatra-vacating-notice.ts
 *   VACATING_DATE=2026-08-23 npx tsx scripts/repair-angatra-vacating-notice.ts --execute
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.prod.live' });
dotenv.config({ path: '.env.production.local' });
dotenv.config();

import { and, eq, sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { auditLog, bookings, customers, vacatingRequests } from '@/src/db/schema';
import { formatDate, parseDate } from '@/src/lib/dates';
import { resolveNoticeGivenDateForVacating } from '@/src/lib/vacating/noticeDateSsot';
import { computeNoticeDeductionForBooking } from '@/src/services/noticeDeduction';
import { recomputeCheckoutSettlementV2ForVacating } from '@/src/services/checkoutSettlement';
import { syncMoveOutUnusedRentWalletCredit } from '@/src/services/residentCreditLedger';

const BOOKING_ID = process.env.BOOKING_ID ?? 'ad24c0d2-f2d1-4c08-99d1-74487560feb5';
const VACATING_REQUEST_ID =
  process.env.VACATING_REQUEST_ID ?? '198831f7-189c-4aaf-874b-c066d6323d05';
const VACATING_DATE = process.env.VACATING_DATE ?? '2026-08-23';
const execute = process.argv.includes('--execute');

type SubmittedAudit = {
  entity_id: string;
  created_at: Date;
  diff: {
    noticeGivenDate?: string;
    vacatingDate?: string;
    deductionPaise?: number;
    monthlyRentPaise?: number;
    noticeBreakdown?: Record<string, unknown>;
    noticeCompliant?: boolean;
  };
};

async function findSubmittedAudit(): Promise<SubmittedAudit | null> {
  const rows = await db.execute<SubmittedAudit>(sql`
    SELECT entity_id, created_at, diff
    FROM audit_log
    WHERE entity = 'vacating_request'
      AND action = 'submitted'
      AND diff->>'bookingId' = ${BOOKING_ID}
    ORDER BY created_at ASC
    LIMIT 1
  `);
  const row = Array.isArray(rows) ? rows[0] : (rows as { rows?: SubmittedAudit[] }).rows?.[0];
  return row ?? null;
}

async function main() {
  const [booking] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      stayType: bookings.stayType,
      durationMode: bookings.durationMode,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, BOOKING_ID))
    .limit(1);
  if (!booking) throw new Error('Booking not found');
  if (booking.bookingCode !== 'APG-2026-0013') {
    throw new Error(`Booking code mismatch: expected APG-2026-0013, got ${booking.bookingCode}`);
  }

  const [customer] = await db
    .select({ fullName: customers.fullName })
    .from(customers)
    .where(eq(customers.id, booking.customerId))
    .limit(1);

  const [existing] = await db
    .select()
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, VACATING_REQUEST_ID))
    .limit(1);

  if (!existing) {
    console.error('Vacating request not found:', VACATING_REQUEST_ID);
    process.exit(1);
  }
  if (existing.bookingId !== BOOKING_ID) {
    throw new Error(
      `Vacating request ${VACATING_REQUEST_ID} does not belong to booking ${BOOKING_ID}`,
    );
  }

  const submittedAudit = await findSubmittedAudit();

  const originalSubmittedAtRaw = existing?.originalNoticeSubmittedAt ?? submittedAudit?.created_at;
  if (!originalSubmittedAtRaw) {
    console.error('Missing original_notice_submitted_at / audit created_at');
    process.exit(1);
  }
  const originalSubmittedAt =
    originalSubmittedAtRaw instanceof Date
      ? originalSubmittedAtRaw
      : new Date(String(originalSubmittedAtRaw));

  const noticeGivenDate = resolveNoticeGivenDateForVacating({
    noticeGivenDate: existing?.noticeGivenDate ?? submittedAudit?.diff.noticeGivenDate ?? originalSubmittedAt,
    originalNoticeSubmittedAt: originalSubmittedAt,
  });
  const vacatingDate = VACATING_DATE;
  const monthlyRent =
    existing?.monthlyRentPaiseSnapshot ??
    submittedAudit?.diff.monthlyRentPaise ??
    459_000;

  const noticeBreakdown = await computeNoticeDeductionForBooking({
    bookingId: BOOKING_ID,
    noticeGivenDate,
    vacatingDate,
    monthlyRentPaise: monthlyRent,
    stayType: booking.stayType,
    durationMode: booking.durationMode,
  });

  console.log('\n=== Angatra vacating repair (dry-run:', !execute, ') ===\n');
  console.log('Resident:', customer?.fullName, booking.bookingCode);
  console.log('Original submission:', originalSubmittedAt.toISOString());
  console.log('Notice calculation date (SSOT):', noticeGivenDate);
  console.log('Requested vacating date:', vacatingDate);
  console.log('Monthly rent snapshot:', monthlyRent);
  console.log('Notice deduction:', noticeBreakdown.noticeDeductionPaise);
  console.log('Existing active row:', existing?.id ?? '(none — will restore from audit)');

  if (!execute) {
    console.log('\nDry run — pass --execute to apply.');
    return;
  }

  let vacatingId = existing.id;
    if (!submittedAudit?.entity_id) throw new Error('Audit entity_id missing for restore');
    const [restored] = await db
      .insert(vacatingRequests)
      .values({
        id: submittedAudit.entity_id,
        bookingId: BOOKING_ID,
        customerId: booking.customerId,
        noticeGivenDate,
        vacatingDate,
        originalNoticeSubmittedAt: originalSubmittedAt,
        originalVacatingDate: vacatingDate,
        noticeCompliant: noticeBreakdown.missingNoticeDays === 0,
        deductionPaise: noticeBreakdown.noticeDeductionPaise,
        depositRefundPaise: 0,
        monthlyRentPaiseSnapshot: monthlyRent,
        noticeRentCoveredDays: noticeBreakdown.rentCoveredDays,
        noticeChargeableDays: noticeBreakdown.chargeableNoticeDays,
        noticeBreakdownJson: noticeBreakdown,
        status: 'pending',
        notes: 'Restored from audit trail after accidental customer cancel (2026-08-20).',
      })
      .returning({ id: vacatingRequests.id });
    vacatingId = restored.id;

    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: null,
      entity: 'vacating_request',
      entityId: vacatingId,
      action: 'restored_from_audit',
      diff: {
        bookingId: BOOKING_ID,
        originalNoticeSubmittedAt: originalSubmittedAt.toISOString(),
        noticeGivenDate,
        vacatingDate,
        sourceAuditEntityId: submittedAudit.entity_id,
      },
    });
  } else {
    await db
      .update(vacatingRequests)
      .set({
        noticeGivenDate,
        vacatingDate,
        originalNoticeSubmittedAt: originalSubmittedAt,
        noticeCompliant: noticeBreakdown.missingNoticeDays === 0,
        deductionPaise: noticeBreakdown.noticeDeductionPaise,
        noticeRentCoveredDays: noticeBreakdown.rentCoveredDays,
        noticeChargeableDays: noticeBreakdown.chargeableNoticeDays,
        noticeBreakdownJson: noticeBreakdown,
        updatedAt: new Date(),
      })
      .where(eq(vacatingRequests.id, existing.id));

    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: null,
      entity: 'vacating_request',
      entityId: existing.id,
      action: 'vacating_date_updated',
      diff: {
        bookingId: BOOKING_ID,
        fromVacatingDate: String(existing.vacatingDate),
        toVacatingDate: vacatingDate,
        originalNoticeSubmittedAt: originalSubmittedAt.toISOString(),
        noticeGivenDate,
        noticeDeductionPaise: noticeBreakdown.noticeDeductionPaise,
      },
    });
  }

  if (!vacatingId) throw new Error('vacatingId missing after repair');

  await recomputeCheckoutSettlementV2ForVacating({
    vacatingRequestId: vacatingId,
    stayCheckoutDate: vacatingDate,
    stayType: booking.stayType,
    durationMode: booking.durationMode,
  });

  const wallet = await syncMoveOutUnusedRentWalletCredit({ vacatingRequestId: vacatingId });
  console.log('\nEXECUTED. Wallet sync:', wallet);
  console.log('Vacating ID:', vacatingId);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closeDb());
