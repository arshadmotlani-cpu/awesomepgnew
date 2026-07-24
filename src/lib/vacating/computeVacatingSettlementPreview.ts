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
          label: 'Deposit held',
          value: formatSettlementPaise(args.depositHeldPaise),
        },
        ...(waterfall.depositBucket.tailRentPaise > 0
          ? [
              {
                id: 'tail_rent_through_vacate',
                label: 'Rent through vacate date',
                value: formatSettlementPaise(waterfall.depositBucket.tailRentPaise, true),
                deduct: true,
              },
            ]
          : []),
        {
          id: 'estimated_refundable_deposit',
          label: 'Estimated refundable deposit',
          value: formatSettlementPaise(waterfall.depositBucket.refundablePaise),
        },
      ],
    },
    {
      title: 'Pending deductions',
      rows: [
        {
          id: 'pending_electricity',
          label: 'Electricity',
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

export type VacatingSettlementWaterfallContext = {
  checkInDate: string;
  vacatingDate: string;
  rentPaidPaise: number;
  depositHeldPaise: number;
  monthlyRentPaise: number;
  missingNoticeDays: number;
  noticeApplies: boolean;
  checkoutTailRentPaise: number;
};

export async function loadVacatingSettlementWaterfallContext(
  input: EstimatedSettlementVacatingInput,
): Promise<{ ctx: VacatingSettlementWaterfallContext; coverage: BillingCoverageModel } | null> {
  const vacatingDate = normalizeIsoDateOnly(input.vacatingDate);
  const noticeGivenDate = normalizeIsoDateOnly(input.noticeGivenDate);
  if (!vacatingDate) return null;

  const monthlyRentPaise = guardDepositPaise(input.monthlyRentPaiseSnapshot);

  const [money, wallet, coverage] = await Promise.all([
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
  ]);

  const checkIn = coverage?.moveInDate ?? (await resolveStayCheckInDate(input.bookingId));
  if (!checkIn || !coverage) return null;

  const rentPaidPaise = guardDepositPaise(money?.rent.receivedPaise ?? 0);
  const depositHeldPaise = guardDepositPaise(wallet?.refundableBalancePaise ?? 0);

  const missingNoticeDays = coverage.noticeBreakdown?.missingNoticeDays ?? 0;
  const checkoutTailRentPaise = coverage.tailRentPaise;

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
