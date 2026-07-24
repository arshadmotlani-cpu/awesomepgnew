/**
 * Server-only notice + billing display for settlement loaders (DB-backed recompute).
 */
import type { NoticeDeductionBreakdown } from '@/src/lib/vacating/noticeDeductionEngine';
import {
  billingCycleLabelFromDay,
  loadMonthlyBillingSnapshotForBooking,
} from '@/src/lib/billing/monthlyBillingSnapshot';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';
import { computeNoticeDeductionForBooking } from '@/src/services/noticeDeduction';
import {
  breakdownFromStoredNoticeSnapshot,
  toNoticeSettlementDisplay,
  type NoticeSettlementDisplay,
} from '@/src/lib/vacating/noticeDeductionPresentation';

export type ResolveNoticeSettlementInput = {
  bookingId: string;
  noticeGivenDate?: string;
  vacatingDate?: string;
  monthlyRentPaiseSnapshot?: number;
  noticeRequiredDays?: number;
  noticeGivenDays?: number;
  noticeShortfallDays?: number;
  noticeRentCoveredDays?: number;
  noticeChargeableDays?: number;
  noticeDeductionPaise?: number;
  deductionPaise?: number;
  noticeBreakdownJson?: Partial<NoticeDeductionBreakdown> | null;
  stayType?: string | null;
  durationMode?: string | null;
};

/** Full notice + billing display for settlement UIs — recomputes when snapshot JSON is incomplete. */
export async function resolveNoticeSettlementDisplayForVacating(
  row: ResolveNoticeSettlementInput,
): Promise<NoticeSettlementDisplay | null> {
  let notice = breakdownFromStoredNoticeSnapshot(row);

  const needsRecompute =
    !notice ||
    notice.billingCycleLabel === '—' ||
    !notice.paidUntilDate;

  if (
    needsRecompute &&
    row.bookingId &&
    row.noticeGivenDate &&
    row.vacatingDate &&
    (row.monthlyRentPaiseSnapshot ?? 0) > 0
  ) {
    const computed = await computeNoticeDeductionForBooking({
      bookingId: row.bookingId,
      noticeGivenDate: row.noticeGivenDate,
      vacatingDate: row.vacatingDate,
      monthlyRentPaise: row.monthlyRentPaiseSnapshot ?? 0,
      stayType: row.stayType,
      durationMode: row.durationMode,
    });
    notice = toNoticeSettlementDisplay(computed);
  }

  const billing = await loadMonthlyBillingSnapshotForBooking({
    bookingId: row.bookingId,
    vacatingDate: row.vacatingDate ?? null,
  });

  if (billing) {
    const base = notice ?? {
      noticeRequiredDays: row.noticeRequiredDays ?? VACATING_NOTICE_MIN_DAYS,
      noticeGivenDays: row.noticeGivenDays ?? 0,
      missingNoticeDays: row.noticeShortfallDays ?? 0,
      billingDay: billing.billingDay,
      billingCycleLabel: billing.billingCycleLabel,
      paidUntilDate: billing.paidUntilDate,
      vacatingDate: row.vacatingDate ?? '',
      unusedPrepaidRentDays: row.noticeRentCoveredDays ?? 0,
      noticeCoveredByPrepaidRent: row.noticeRentCoveredDays ?? 0,
      chargeableNoticeDays: row.noticeChargeableDays ?? 0,
      noticeDeductionPaise: row.noticeDeductionPaise ?? row.deductionPaise ?? 0,
    };
    return {
      ...base,
      billingCycleLabel:
        base.billingCycleLabel === '—' ? billing.billingCycleLabel : base.billingCycleLabel,
      paidUntilDate: base.paidUntilDate ?? billing.paidUntilDate,
      billingDay: base.billingDay || billing.billingDay,
    };
  }

  if (notice && notice.billingCycleLabel === '—' && notice.billingDay) {
    return {
      ...notice,
      billingCycleLabel: billingCycleLabelFromDay(notice.billingDay),
    };
  }

  return notice;
}
