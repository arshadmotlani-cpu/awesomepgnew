/**
 * Registers all Wave 2 repair handlers with the Repair Engine.
 * Side-effect import from repairEngine.dispatch.
 */

import { registerRepair } from '@/src/lib/health/repairEngine';
import { cleanupSyntheticPaymentReviews } from '@/src/lib/health/syntheticPollutionCleanup';
import {
  markStuckElectricityGenerationJobsFailed,
  repairMissingBillingProfileForBooking,
  repairMissingElectricityBillForRoom,
  repairMissingRentForBooking,
} from '@/src/lib/health/conservativeBillRepairs';
import { formatDate } from '@/src/lib/dates';

function priorMonthIso(currentMonth: string): string {
  const d = new Date(`${currentMonth}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.toISOString().slice(0, 7)}-01`;
}

registerRepair({
  id: 'repairOrphanReservesBlockingActiveStay',
  auto: true,
  description: 'Cancel orphan draft/pending reserves blocking an active stay (no hold)',
  codes: ['PORTAL_BLOCKED_BY_ORPHAN_RESERVE'],
  async execute() {
    const { repairOrphanReservesBlockingActiveStay } = await import(
      '@/src/lib/residents/residentBrainIntegrity'
    );
    const result = await repairOrphanReservesBlockingActiveStay();
    return {
      ok: true,
      rowsTouched: result.cancelledBookingIds.length,
      skipped: result.skipped.length,
      diff: result,
    };
  },
});

registerRepair({
  id: 'repairStaleDraftReservesWithoutHold',
  auto: true,
  description: 'Cancel draft+reserve with no hold aged ≥14 days',
  codes: ['STALE_DRAFT_NO_HOLD'],
  async execute() {
    const { repairStaleDraftReservesWithoutHold } = await import(
      '@/src/lib/health/bookingBrainIntegrity'
    );
    const result = await repairStaleDraftReservesWithoutHold();
    return {
      ok: true,
      rowsTouched: result.cancelledBookingIds.length,
      diff: result,
    };
  },
});

registerRepair({
  id: 'repairExpiredReservesWithoutHold',
  auto: true,
  description: 'Cancel expired/pending reserves with no hold',
  codes: ['EXPIRED_RESERVE_NO_HOLD'],
  async execute() {
    const { repairExpiredReservesWithoutHold } = await import(
      '@/src/lib/health/bookingBrainIntegrity'
    );
    const result = await repairExpiredReservesWithoutHold();
    return {
      ok: true,
      rowsTouched: result.cancelledBookingIds.length,
      diff: result,
    };
  },
});

registerRepair({
  id: 'excludeInvalidPaymentReviews',
  auto: true,
  description: 'Invalid reviews already excluded from Operations queue (no-op confirm)',
  codes: [],
  async execute() {
    return { ok: true, rowsTouched: 0, message: 'queue_filter_active' };
  },
});

registerRepair({
  id: 'cleanupSyntheticPaymentReviews',
  auto: true,
  description: 'Cancel synthetic 2099/OPT*/example.com payment-review pollution',
  codes: ['SYNTHETIC_PAYMENT_REVIEW', 'INVALID_BILLING_MONTH', 'INVALID_SCREENSHOT'],
  async execute(ctx) {
    const result = await cleanupSyntheticPaymentReviews({
      limit: 100,
      dryRun: ctx.dryRun,
    });
    return {
      ok: true,
      rowsTouched: result.rentCancelled.length + result.electricityCleared.length,
      skipped: result.skipped.length,
      diff: result,
    };
  },
});

registerRepair({
  id: 'repairMissingRentInvoiceConservative',
  auto: true,
  description: 'Ensure unpaid monthly rent invoice when anniversary window elapsed',
  codes: ['MISSING_CURRENT_MONTH_RENT'],
  async execute(ctx) {
    const bookingId =
      ctx.issue?.entityType === 'booking' ? ctx.issue.entityId : null;
    if (!bookingId) {
      return { ok: true, rowsTouched: 0, skipped: 1, message: 'no_booking_id' };
    }
    return repairMissingRentForBooking({
      bookingId,
      billingMonth: ctx.billingMonth,
    });
  },
});

registerRepair({
  id: 'repairMissingElectricityBillConservative',
  auto: true,
  description: 'Create electricity bill from monthly reading when safe',
  codes: ['MISSING_ELECTRICITY_WINDOW', 'METER_LOG_WITHOUT_BILL'],
  async execute(ctx) {
    const roomId = ctx.issue?.entityId;
    if (!roomId) {
      return { ok: true, rowsTouched: 0, skipped: 1, message: 'no_room_id' };
    }
    const billingMonth =
      ctx.billingMonth ??
      `${formatDate(new Date()).slice(0, 7)}-01`;
    // Prefer prior month for MISSING_ELECTRICITY_WINDOW
    const month =
      ctx.issue?.code === 'MISSING_ELECTRICITY_WINDOW'
        ? priorMonthIso(billingMonth)
        : billingMonth;
    return repairMissingElectricityBillForRoom({ roomId, billingMonth: month });
  },
});

registerRepair({
  id: 'repairMissingBillingProfile',
  auto: true,
  description: 'Create empty/idempotent billing profile for booking',
  codes: ['MISSING_BILLING_PROFILE'],
  async execute(ctx) {
    const bookingId = ctx.issue?.entityId;
    if (!bookingId) {
      return { ok: true, rowsTouched: 0, skipped: 1, message: 'no_booking_id' };
    }
    return repairMissingBillingProfileForBooking(bookingId);
  },
});

registerRepair({
  id: 'repairStuckElectricityGenerationJob',
  auto: true,
  description: 'Mark stuck electricity generation jobs failed',
  codes: ['GENERATION_JOB_STUCK_WITHOUT_BILL'],
  async execute() {
    return markStuckElectricityGenerationJobsFailed();
  },
});

registerRepair({
  id: 'repairAbandonedDraftsWithActiveStay',
  auto: true,
  description: 'Cancel abandoned drafts with active stay (no hold/payment/invoice)',
  codes: ['DRAFT_BOOKING_WITH_ACTIVE_STAY'],
  async execute() {
    const { repairAbandonedDraftsWithActiveStay } = await import(
      '@/src/lib/health/wave3IntegrityRepairs'
    );
    return repairAbandonedDraftsWithActiveStay();
  },
});

registerRepair({
  id: 'repairResidencyTenancyDrift',
  auto: true,
  description: 'Sync/demote residency_status to match assigned tenancy SSOT',
  codes: ['ACTIVE_RESIDENCY_WITHOUT_TENANCY', 'TENANCY_WITHOUT_ACTIVE_RESIDENCY'],
  async execute() {
    const { repairResidencyTenancyDrift } = await import(
      '@/src/lib/health/wave3IntegrityRepairs'
    );
    return repairResidencyTenancyDrift();
  },
});

registerRepair({
  id: 'repairUnambiguousOrphanRentPaymentLinks',
  auto: true,
  description: 'Link orphan rent payment to unique matching paid invoice',
  codes: ['PAYMENT_WITHOUT_INVOICE'],
  async execute() {
    const { repairUnambiguousOrphanRentPaymentLinks } = await import(
      '@/src/lib/health/wave3IntegrityRepairs'
    );
    return repairUnambiguousOrphanRentPaymentLinks();
  },
});

registerRepair({
  id: 'repairEndedConfirmedFixedStayBookings',
  auto: true,
  description: 'Complete ended fixed-stay bookings with no active bed',
  codes: ['CONFIRMED_WITHOUT_BED'],
  async execute() {
    const { repairEndedConfirmedFixedStayBookings } = await import(
      '@/src/lib/health/wave3IntegrityRepairs'
    );
    return repairEndedConfirmedFixedStayBookings();
  },
});

registerRepair({
  id: 'repairMissingBills',
  auto: false,
  description: 'Do not invent bills without conservative gates',
  codes: [],
  async execute() {
    return { ok: false, rowsTouched: 0, message: 'disabled' };
  },
});
