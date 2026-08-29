/**
 * SSOT — vacating settlement waterfall + EstimatedSettlementPreview for all surfaces.
 */
import { diffDays, normalizeIsoDateOnly } from '@/src/lib/dates';
import { noticeDeductionAppliesToBooking } from '@/src/lib/checkout/noticeDeductionPolicy';
import {
  computeCheckoutSettlementV2,
  type CheckoutSettlementWaterfall,
} from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { resolveStayCheckInDate } from '@/src/lib/checkout/checkoutSettlementV2Compute';
import { loadBillingCoverageModel } from '@/src/services/billingCoverage';
import type { BillingCoverageModel } from '@/src/lib/billing/billingCoverageModel';
import { dailyRateFromBillingPeriod } from '@/src/lib/billing/billingCoverageModel';
import {
  dailyRateFromCalendarMonth,
  firstOfMonth,
} from '@/src/services/billing';
import {
  formatDualDaysAndPaise,
  formatRentConsumedHint,
  formatSettlementDays,
  formatSettlementPaise,
  PENDING_DAMAGES_LABEL,
  PENDING_ELECTRICITY_LABEL,
  PENDING_OTHER_LABEL,
  type SettlementDisplaySection,
} from '@/src/lib/checkout/settlementDisplayFormat';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { buildSettlementBillingDatesSectionRows } from '@/src/lib/vacating/settlementBillingRows';
import { resolveNoticeGivenDateForVacating } from '@/src/lib/vacating/noticeDateSsot';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import type {
  EstimatedSettlementPreview,
  EstimatedSettlementVacatingInput,
} from '@/src/lib/vacating/estimatedSettlementPreview';
import type { NoticeSettlementDisplay } from '@/src/lib/vacating/noticeDeductionPresentation';

export type BuildVacatingSettlementPreviewSectionsArgs = {
  notice: NoticeSettlementDisplay | null;
  vacatingDate: string;
  noticeGivenDate: string;
  noticeGivenDays: number;
  waterfall: CheckoutSettlementWaterfall;
  coverage: BillingCoverageModel;
  depositHeldPaise: number;
  outstandingTailRentInvoicePaise?: number;
  mode: EstimatedSettlementPreview['mode'];
};

export function buildVacatingSettlementPreviewSections(
  args: BuildVacatingSettlementPreviewSectionsArgs,
): {
  sections: SettlementDisplaySection[];
  auditTrace: EstimatedSettlementPreview['auditTrace'];
  depositHeldPaise: number;
} {
  const { waterfall, mode } = args;
  const dailyRentPaise = waterfall.rentBucket.dailyRentPaise;

  const hasPendingElectricity =
    mode === 'estimate' || (mode === 'baseline' && waterfall.depositBucket.electricityPaise === 0);
  const hasPendingDamage =
    mode === 'estimate' || (mode === 'baseline' && waterfall.depositBucket.otherPaise === 0);

  const auditTrace: EstimatedSettlementPreview['auditTrace'] = [];
  auditTrace.push({
    id: 'rent_consumed_audit',
    label: 'Rent consumed (calculation)',
    value: formatRentConsumedHint(waterfall.stay.stayDays, dailyRentPaise),
  });

  const sections: SettlementDisplaySection[] = [
    {
      title: 'Billing & dates',
      rows: buildSettlementBillingDatesSectionRows({
        notice: args.notice,
        vacatingDate: args.vacatingDate,
        stayDays: waterfall.stay.stayDays,
        checkInDate: waterfall.stay.checkInDate,
        checkoutDate: waterfall.stay.checkoutDate,
      }),
    },
    {
      title: 'Rent',
      rows: [
        {
          id: 'rent_paid',
          label: 'Rent paid',
          value: formatSettlementPaise(waterfall.rentBucket.paidPaise),
        },
        {
          id: 'rent_consumed',
          label: 'Rent consumed',
          value: formatSettlementPaise(waterfall.rentBucket.consumedPaise),
        },
        {
          id: 'unused_prepaid_rent',
          label: 'Unused prepaid rent',
          value: formatDualDaysAndPaise(args.notice?.unusedPrepaidRentDays, waterfall.rentBucket.unusedPaise),
        },
      ],
    },
    {
      title: 'Notice',
      rows: [
        {
          id: 'notice_required',
          label: 'Required notice',
          value: args.notice ? formatSettlementDays(args.notice.noticeRequiredDays) : '—',
        },
        {
          id: 'notice_given',
          label: 'Notice given',
          value: formatSettlementDays(args.noticeGivenDays),
        },
        {
          id: 'notice_covered_by_unused_rent',
          label: 'Notice covered by unused rent',
          value: formatDualDaysAndPaise(
            args.notice?.noticeCoveredByPrepaidRent,
            waterfall.notice.fromUnusedRentPaise,
          ),
        },
        {
          id: 'notice_from_deposit',
          label: 'Remaining notice deducted from deposit',
          value: formatSettlementPaise(waterfall.notice.fromDepositPaise, true),
          deduct: true,
        },
      ],
    },
    {
      title: 'Deposit',
      rows: [
        {
          id: 'deposit_held',
          label: 'Security deposit',
          value: formatSettlementPaise(args.depositHeldPaise),
        },
        {
          id: 'notice_from_deposit_row',
          label: 'Less notice (from deposit)',
          value: formatSettlementPaise(waterfall.notice.fromDepositPaise, true),
          deduct: waterfall.notice.fromDepositPaise > 0,
        },
        {
          id: 'pending_electricity_deposit',
          label: 'Less electricity',
          value: hasPendingElectricity
            ? PENDING_ELECTRICITY_LABEL
            : formatSettlementPaise(waterfall.depositBucket.electricityPaise, true),
          deduct: !hasPendingElectricity && waterfall.depositBucket.electricityPaise > 0,
        },
        {
          id: 'pending_damages_deposit',
          label: 'Less damage / cleaning / other',
          value: hasPendingDamage
            ? PENDING_DAMAGES_LABEL
            : formatSettlementPaise(waterfall.depositBucket.otherPaise, true),
          deduct: !hasPendingDamage && waterfall.depositBucket.otherPaise > 0,
        },
        {
          id: 'estimated_refundable_deposit',
          label: 'Refundable deposit',
          value: formatSettlementPaise(waterfall.depositBucket.refundablePaise),
        },
      ],
    },
    {
      title: 'Refund summary',
      rows: [
        {
          id: 'unused_prepaid_refund',
          label: 'Unused prepaid rent',
          value: formatSettlementPaise(waterfall.refund.unusedRentPortionPaise),
        },
        ...((args.outstandingTailRentInvoicePaise ??
          waterfall.outstandingRentInvoicePaise ??
          0) > 0
          ? [
              {
                id: 'outstanding_final_rent_invoice',
                label: 'Outstanding final-period rent invoice',
                value: formatSettlementPaise(
                  args.outstandingTailRentInvoicePaise ??
                    waterfall.outstandingRentInvoicePaise ??
                    0,
                  true,
                ),
                deduct: true,
              },
            ]
          : []),
        {
          id: 'final_estimated_refund',
          label: mode === 'final' ? 'Final estimated refund' : 'Estimated refund',
          value: formatSettlementPaise(waterfall.refund.totalPaise),
        },
      ],
    },
    {
      title: 'Pending deductions',
      rows: [
        {
          id: 'pending_electricity',
          label: 'Electricity (detail)',
          value: hasPendingElectricity
            ? PENDING_ELECTRICITY_LABEL
            : formatSettlementPaise(waterfall.depositBucket.electricityPaise, true),
          deduct: !hasPendingElectricity,
        },
        {
          id: 'pending_damages',
          label: 'Damages',
          value: hasPendingDamage
            ? PENDING_DAMAGES_LABEL
            : formatSettlementPaise(waterfall.depositBucket.otherPaise, true),
          deduct: !hasPendingDamage,
        },
        {
          id: 'pending_other',
          label: 'Other deductions',
          value: hasPendingDamage ? PENDING_OTHER_LABEL : formatSettlementPaise(0),
        },
      ],
    },
  ];

  return { sections, auditTrace, depositHeldPaise: args.depositHeldPaise };
}

function periodDailyRentFromCoverage(
  coverage: BillingCoverageModel,
  vacatingDate: string,
  monthlyRentPaise: number,
): number | undefined {
  const period =
    coverage.periodUsedForPrepaid ??
    coverage.paidInvoiceCoverage.find(
      (p) =>
        (p.paidPrincipalPaise ?? 0) > 0 &&
        p.periodStart <= vacatingDate &&
        p.periodEnd >= vacatingDate,
    );
  if (period?.paidPrincipalPaise && period.periodStart && period.periodEnd) {
    return dailyRateFromBillingPeriod(
      period.paidPrincipalPaise,
      period.periodStart,
      period.periodEnd,
    );
  }
  if (coverage.billingCyclePolicy === 'calendar_month_1st' && monthlyRentPaise > 0) {
    return dailyRateFromCalendarMonth(monthlyRentPaise, firstOfMonth(vacatingDate));
  }
  return undefined;
}

export type VacatingSettlementWaterfallContext = {
  checkInDate: string;
  vacatingDate: string;
  rentPaidPaise: number;
  depositHeldPaise: number;
  monthlyRentPaise: number;
  missingNoticeDays: number;
  noticeApplies: boolean;
  checkoutTailRentPaise: number;
  outstandingRentInvoicePaise?: number;
  prepaidAfterVacatingPaise?: number;
  periodDailyRentPaise?: number;
};

export async function loadVacatingSettlementWaterfallContext(
  input: EstimatedSettlementVacatingInput,
): Promise<{ ctx: VacatingSettlementWaterfallContext; coverage: BillingCoverageModel } | null> {
  const vacatingDate = normalizeIsoDateOnly(input.vacatingDate);
  const noticeGivenDate = resolveNoticeGivenDateForVacating({
    noticeGivenDate: input.noticeGivenDate,
    originalNoticeSubmittedAt: input.originalNoticeSubmittedAt,
  });
  if (!vacatingDate) return null;

  const monthlyRentPaise = guardDepositPaise(input.monthlyRentPaiseSnapshot);

  const { resolveFinalPeriodRentInvoiceOutstandingForBooking } = await import(
    '@/src/lib/checkout/checkoutSettlementV2Compute'
  );

  const [money, wallet, coverage, finalPeriodInvoice] = await Promise.all([
    getBookingMoneyBalances(input.bookingId),
    getDepositSummaryForBooking(input.bookingId),
    loadBillingCoverageModel({
      bookingId: input.bookingId,
      vacatingDate,
      noticeGivenDate,
      monthlyRentPaise,
      stayType: input.stayType,
      durationMode: input.durationMode,
      treatAsApprovedForTail: true,
    }),
    resolveFinalPeriodRentInvoiceOutstandingForBooking({
      bookingId: input.bookingId,
      vacatingDate,
    }),
  ]);

  const checkIn = coverage?.moveInDate ?? (await resolveStayCheckInDate(input.bookingId));
  if (!checkIn || !coverage) return null;

  const rentPaidPaise = guardDepositPaise(money?.rent.receivedPaise ?? 0);
  const depositHeldPaise = guardDepositPaise(wallet?.refundableBalancePaise ?? 0);

  const prepaidAfterVacatingPaise = coverage.prepaidAfterVacatingPaise;

  const missingNoticeDays = coverage.noticeBreakdown?.missingNoticeDays ?? 0;
  /** Occupancy rent through vacate is always a rent invoice — never deposit tail rent. */
  const checkoutTailRentPaise = 0;
  const periodDailyRentPaise = periodDailyRentFromCoverage(
    coverage,
    vacatingDate,
    monthlyRentPaise,
  );

  return {
    ctx: {
      checkInDate: checkIn,
      vacatingDate,
      rentPaidPaise,
      depositHeldPaise,
      monthlyRentPaise,
      missingNoticeDays,
      noticeApplies: noticeDeductionAppliesToBooking({
        stayType: input.stayType,
        durationMode: input.durationMode,
      }),
      checkoutTailRentPaise,
      outstandingRentInvoicePaise: finalPeriodInvoice.outstandingPaise,
      prepaidAfterVacatingPaise,
      periodDailyRentPaise,
    },
    coverage,
  };
}

export function computeVacatingSettlementWaterfallFromContext(
  ctx: VacatingSettlementWaterfallContext,
): CheckoutSettlementWaterfall {
  return computeCheckoutSettlementV2({
    stayCheckInDate: ctx.checkInDate,
    stayCheckoutDate: ctx.vacatingDate,
    rentPaidPaise: ctx.rentPaidPaise,
    monthlyRentPaise: ctx.monthlyRentPaise,
    depositCollectedPaise: ctx.depositHeldPaise,
    missingNoticeDays: ctx.missingNoticeDays,
    electricityPaise: 0,
    electricityDeductFromDeposit: true,
    damageChargePaise: 0,
    cleaningChargePaise: 0,
    customChargePaise: 0,
    noticeApplies: ctx.noticeApplies,
    checkoutTailRentPaise: ctx.checkoutTailRentPaise,
    outstandingRentInvoicePaise: ctx.outstandingRentInvoicePaise ?? 0,
    prepaidAfterVacatingPaise: ctx.prepaidAfterVacatingPaise ?? 0,
    periodDailyRentPaise: ctx.periodDailyRentPaise,
  });
}

export async function computeVacatingSettlementWaterfall(
  input: EstimatedSettlementVacatingInput,
): Promise<{
  waterfall: CheckoutSettlementWaterfall;
  ctx: VacatingSettlementWaterfallContext;
  coverage: BillingCoverageModel;
} | null> {
  const loaded = await loadVacatingSettlementWaterfallContext(input);
  if (!loaded) return null;
  return {
    ctx: loaded.ctx,
    coverage: loaded.coverage,
    waterfall: computeVacatingSettlementWaterfallFromContext(loaded.ctx),
  };
}

export async function buildVacatingSettlementPreview(
  input: EstimatedSettlementVacatingInput,
  opts?: { mode?: EstimatedSettlementPreview['mode']; waterfall?: CheckoutSettlementWaterfall | null },
): Promise<EstimatedSettlementPreview | null> {
  const { loadVacatingBillingPresentation } = await import(
    '@/src/lib/vacating/loadVacatingBillingPresentation'
  );
  const presentation = await loadVacatingBillingPresentation({
    ...input,
    mode: opts?.mode ?? 'estimate',
    waterfall: opts?.waterfall ?? null,
  });
  return presentation?.estimatedSettlement ?? null;
}
