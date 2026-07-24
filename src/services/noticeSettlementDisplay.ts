/**
 * Server-only notice + billing display for settlement loaders (BillingCoverageModel SSOT).
 */
import type { NoticeDeductionBreakdown } from '@/src/lib/vacating/noticeDeductionEngine';
import type { BillingCoverageModel } from '@/src/lib/billing/billingCoverageModel';
import { loadBillingCoverageModel } from '@/src/services/billingCoverage';
import { noticeDisplayFromBillingCoverage } from '@/src/lib/vacating/loadVacatingBillingPresentation';
import type { NoticeSettlementDisplay } from '@/src/lib/vacating/noticeDeductionPresentation';

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
  /** Ignored for display — persisted audit only. */
  noticeBreakdownJson?: Partial<NoticeDeductionBreakdown> | null;
  stayType?: string | null;
  durationMode?: string | null;
  treatAsApprovedForTail?: boolean;
  /** When caller already loaded coverage, pass it to avoid duplicate DB work. */
  billingCoverage?: BillingCoverageModel | null;
};

/** Notice + billing labels from BillingCoverageModel only. */
export async function resolveNoticeSettlementDisplayForVacating(
  row: ResolveNoticeSettlementInput,
): Promise<NoticeSettlementDisplay | null> {
  let coverage = row.billingCoverage ?? null;

  if (
    !coverage &&
    row.bookingId &&
    row.noticeGivenDate &&
    row.vacatingDate &&
    (row.monthlyRentPaiseSnapshot ?? 0) > 0
  ) {
    coverage = await loadBillingCoverageModel({
      bookingId: row.bookingId,
      vacatingDate: row.vacatingDate,
      noticeGivenDate: row.noticeGivenDate,
      monthlyRentPaise: row.monthlyRentPaiseSnapshot ?? 0,
      stayType: row.stayType,
      durationMode: row.durationMode,
      treatAsApprovedForTail: row.treatAsApprovedForTail,
    });
  }

  if (!coverage) return null;

  return noticeDisplayFromBillingCoverage(coverage);
}
