/**
 * Resident move-out settlement story — plain-English view model (no accounting jargon on surface).
 */
import { tryDiffDays } from '@/src/lib/dates';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { isFixedStayDurationMode } from '@/src/lib/checkout/checkoutWorkflow';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import type { EstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';
import {
  breakdownFromStoredNoticeSnapshot,
  type NoticeSettlementDisplay,
} from '@/src/lib/vacating/noticeDeductionPresentation';
import type { NoticeDeductionBreakdown } from '@/src/lib/vacating/noticeDeductionEngine';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';

export const RESIDENT_STORY_LABELS = {
  moveOutDetails: 'Move-out Details',
  noticeSubmitted: 'Notice submitted',
  approvedMoveOutDate: 'Approved move-out date',
  requestedMoveOutDate: 'Requested move-out date',
  requiredNotice: 'Required notice',
  noticeGiven: 'Notice given',
  noticeShort: 'Notice short',
  moneyYouPaid: 'Money You Paid',
  monthlyRent: 'Monthly Rent',
  securityDeposit: 'Security Deposit',
  totalPaid: 'Total Paid',
  howMoneyWasUsed: 'How Your Money Was Used',
  rentUsed: 'Rent Used',
  unusedRentBalance: 'Unused Rent Balance',
  noticePolicyCharge: 'Notice Policy Charge',
  paidUsingUnusedRent: 'Paid using Unused Rent',
  remainingNoticeCharge: 'Remaining Notice Charge',
  takenFromSecurityDeposit: 'Taken from Security Deposit',
  noNoticePolicyCharge: 'No notice policy charge',
  securityDepositSection: 'Security Deposit',
  depositReceived: 'Security Deposit Received',
  lessNoticePolicyCharge: 'Less Notice Policy Charge',
  electricityCharge: 'Electricity charge',
  damageCharge: 'Damage charge',
  rentThroughMoveOut: 'Rent through move-out date',
  remainingDeposit: 'Remaining Deposit',
  expectedDepositRefund: 'Expected Deposit Refund',
  plusUnusedRentReturned: 'Plus unused rent returned to you',
  detailedBreakdown: 'View detailed breakdown',
  pendingElectricity: 'Final electricity reading',
  pendingInspection: 'Room inspection',
  pendingDeductionsNote:
    'Any electricity charges or damage charges will be deducted before refund.',
  badgeCompliant: 'Notice policy followed',
  badgeShort: 'Notice was short',
} as const;

/** Substrings that must not appear in default story copy (accordion may still use technical terms). */
export const RESIDENT_STORY_FORBIDDEN_COPY = [
  'Deposit held',
  'Estimated refund',
  'Rent consumed',
  'Unused prepaid rent',
  'Billing cycle',
  'Notice deduction',
  'Settlement statement',
  'Prepaid coverage',
  'Paid until',
] as const;

export type ResidentMoveOutStoryMoneyStep = {
  id: string;
  label: string;
  amountPaise: number;
  /** Narrative-only step with no amount */
  narrativeOnly?: boolean;
};

export type ResidentMoveOutStoryMoveOutDetails = {
  noticeSubmittedDate: string | null;
  moveOutDate: string | null;
  moveOutDateLabel: string;
  requiredNoticeDays: number;
  noticeGivenDays: number;
  noticeShortDays: number;
  badge: 'compliant' | 'short' | 'none';
  badgeLabel: string;
};

export type ResidentMoveOutStoryPayments = {
  monthlyRentPaise: number;
  securityDepositPaise: number;
  totalPaidPaise: number;
};

export type ResidentMoveOutStoryDepositLines = {
  receivedPaise: number;
  noticeFromDepositPaise: number;
  electricityPaise: number;
  damagePaise: number;
  tailRentPaise: number;
  remainingPaise: number;
};

export type ResidentMoveOutStoryRefund = {
  expectedDepositRefundPaise: number;
  showApproxPrefix: boolean;
  unusedRentReturnedPaise: number;
  showPendingChecklist: boolean;
  pendingItems: string[];
};

export type ResidentMoveOutSettlementStory = {
  mode: EstimatedSettlementPreview['mode'];
  noticeApplies: boolean;
  moveOutDetails: ResidentMoveOutStoryMoveOutDetails;
  payments: ResidentMoveOutStoryPayments;
  moneyFlowSteps: ResidentMoveOutStoryMoneyStep[];
  deposit: ResidentMoveOutStoryDepositLines;
  refund: ResidentMoveOutStoryRefund;
};

export type BuildResidentMoveOutSettlementStoryInput = {
  noticeGivenDate: string | null;
  vacatingDate: string | null;
  vacatingStatus: string | null;
  durationMode?: string | null;
  monthlyRentPaise?: number;
  monthlyRentPaiseSnapshot?: number;
  depositHeldPaise: number;
  waterfall: CheckoutSettlementWaterfall | null;
  mode?: EstimatedSettlementPreview['mode'];
  notice?: NoticeSettlementDisplay | null;
  noticeRentCoveredDays?: number;
  noticeChargeableDays?: number;
  deductionPaise?: number;
  noticeBreakdownJson?: Partial<NoticeDeductionBreakdown> | null;
};

function resolveNotice(
  input: BuildResidentMoveOutSettlementStoryInput,
): NoticeSettlementDisplay | null {
  if (input.notice) return input.notice;
  if (!input.noticeGivenDate || !input.vacatingDate) return null;
  return breakdownFromStoredNoticeSnapshot({
    noticeGivenDate: input.noticeGivenDate,
    vacatingDate: input.vacatingDate,
    noticeGivenDays: Math.max(
      0,
      tryDiffDays(input.noticeGivenDate, input.vacatingDate) ?? 0,
    ),
    noticeRentCoveredDays: input.noticeRentCoveredDays,
    noticeChargeableDays: input.noticeChargeableDays,
    deductionPaise: input.deductionPaise,
    noticeBreakdownJson: input.noticeBreakdownJson,
  });
}

function collectStoryCopyForAudit(story: ResidentMoveOutSettlementStory): string {
  const parts: string[] = [
    RESIDENT_STORY_LABELS.moveOutDetails,
    story.moveOutDetails.badgeLabel,
    RESIDENT_STORY_LABELS.moneyYouPaid,
    RESIDENT_STORY_LABELS.howMoneyWasUsed,
    ...story.moneyFlowSteps.map((s) => s.label),
    RESIDENT_STORY_LABELS.securityDepositSection,
    RESIDENT_STORY_LABELS.expectedDepositRefund,
    ...story.refund.pendingItems,
  ];
  return parts.join('\n');
}

/** @internal exported for tests */
export function assertResidentStorySurfaceCopyClean(story: ResidentMoveOutSettlementStory): void {
  const blob = collectStoryCopyForAudit(story);
  for (const forbidden of RESIDENT_STORY_FORBIDDEN_COPY) {
    if (blob.toLowerCase().includes(forbidden.toLowerCase())) {
      throw new Error(`Resident story surface contains forbidden copy: ${forbidden}`);
    }
  }
}

export function buildResidentMoveOutSettlementStory(
  input: BuildResidentMoveOutSettlementStoryInput,
): ResidentMoveOutSettlementStory | null {
  const waterfall = input.waterfall;
  if (!waterfall) return null;

  const mode = input.mode ?? 'estimate';
  const noticeApplies = !isFixedStayDurationMode(input.durationMode ?? 'monthly');
  const notice = noticeApplies ? resolveNotice(input) : null;

  const requiredNoticeDays = notice?.noticeRequiredDays ?? VACATING_NOTICE_MIN_DAYS;
  const noticeGivenDays =
    notice?.noticeGivenDays ??
    (input.noticeGivenDate && input.vacatingDate
      ? Math.max(0, tryDiffDays(input.noticeGivenDate, input.vacatingDate) ?? 0)
      : 0);
  const noticeShortDays =
    notice?.missingNoticeDays ??
    Math.max(0, requiredNoticeDays - noticeGivenDays);

  const approved = input.vacatingStatus === 'approved' || input.vacatingStatus === 'completed';
  const badge: ResidentMoveOutStoryMoveOutDetails['badge'] = !noticeApplies
    ? 'none'
    : noticeShortDays <= 0
      ? 'compliant'
      : 'short';

  const moveOutDetails: ResidentMoveOutStoryMoveOutDetails = {
    noticeSubmittedDate: input.noticeGivenDate,
    moveOutDate: input.vacatingDate,
    moveOutDateLabel: approved
      ? RESIDENT_STORY_LABELS.approvedMoveOutDate
      : RESIDENT_STORY_LABELS.requestedMoveOutDate,
    requiredNoticeDays,
    noticeGivenDays,
    noticeShortDays,
    badge,
    badgeLabel:
      badge === 'compliant'
        ? RESIDENT_STORY_LABELS.badgeCompliant
        : badge === 'short'
          ? RESIDENT_STORY_LABELS.badgeShort
          : '',
  };

  const monthlyRentPaise = guardDepositPaise(
    input.monthlyRentPaiseSnapshot ?? input.monthlyRentPaise ?? waterfall.rentBucket.paidPaise,
  );
  const securityDepositPaise = guardDepositPaise(
    waterfall.depositBucket.collectedPaise || input.depositHeldPaise,
  );

  const payments: ResidentMoveOutStoryPayments = {
    monthlyRentPaise,
    securityDepositPaise,
    totalPaidPaise: monthlyRentPaise + securityDepositPaise,
  };

  const moneyFlowSteps = buildMoneyFlowSteps(waterfall, noticeApplies);

  const deposit: ResidentMoveOutStoryDepositLines = {
    receivedPaise: securityDepositPaise,
    noticeFromDepositPaise: guardDepositPaise(waterfall.notice.fromDepositPaise),
    electricityPaise: guardDepositPaise(waterfall.depositBucket.electricityPaise),
    damagePaise: guardDepositPaise(waterfall.depositBucket.otherPaise),
    tailRentPaise: guardDepositPaise(waterfall.depositBucket.tailRentPaise),
    remainingPaise: guardDepositPaise(waterfall.depositBucket.refundablePaise),
  };

  const hasPendingElectricity =
    mode !== 'final' && waterfall.depositBucket.electricityPaise === 0;
  const hasPendingDamage = mode !== 'final' && waterfall.depositBucket.otherPaise === 0;
  const showPendingChecklist = mode !== 'final' || hasPendingElectricity || hasPendingDamage;

  const pendingItems: string[] = [];
  if (showPendingChecklist) {
    pendingItems.push(RESIDENT_STORY_LABELS.pendingElectricity);
    pendingItems.push(RESIDENT_STORY_LABELS.pendingInspection);
  }

  const refund: ResidentMoveOutStoryRefund = {
    expectedDepositRefundPaise: deposit.remainingPaise,
    showApproxPrefix: mode === 'estimate' || mode === 'baseline',
    unusedRentReturnedPaise: guardDepositPaise(waterfall.refund.unusedRentPortionPaise),
    showPendingChecklist,
    pendingItems,
  };

  const story: ResidentMoveOutSettlementStory = {
    mode,
    noticeApplies,
    moveOutDetails,
    payments,
    moneyFlowSteps,
    deposit,
    refund,
  };

  assertResidentStorySurfaceCopyClean(story);
  return story;
}

function buildMoneyFlowSteps(
  waterfall: CheckoutSettlementWaterfall,
  noticeApplies: boolean,
): ResidentMoveOutStoryMoneyStep[] {
  const steps: ResidentMoveOutStoryMoneyStep[] = [];
  const { rentBucket, notice } = waterfall;

  if (rentBucket.consumedPaise > 0) {
    steps.push({
      id: 'rent_used',
      label: RESIDENT_STORY_LABELS.rentUsed,
      amountPaise: rentBucket.consumedPaise,
    });
  }

  if (rentBucket.unusedPaise > 0) {
    steps.push({
      id: 'unused_rent',
      label: RESIDENT_STORY_LABELS.unusedRentBalance,
      amountPaise: rentBucket.unusedPaise,
    });
  }

  if (!noticeApplies || notice.fullPaise <= 0) {
    if (noticeApplies) {
      steps.push({
        id: 'no_notice',
        label: RESIDENT_STORY_LABELS.noNoticePolicyCharge,
        amountPaise: 0,
        narrativeOnly: true,
      });
    }
    return steps;
  }

  steps.push({
    id: 'notice_full',
    label: RESIDENT_STORY_LABELS.noticePolicyCharge,
    amountPaise: notice.fullPaise,
  });

  if (notice.fromUnusedRentPaise > 0) {
    steps.push({
      id: 'notice_from_unused',
      label: RESIDENT_STORY_LABELS.paidUsingUnusedRent,
      amountPaise: notice.fromUnusedRentPaise,
    });
  }

  const remainingNotice = Math.max(0, notice.fullPaise - notice.fromUnusedRentPaise);
  if (remainingNotice > 0 && notice.fromDepositPaise > 0) {
    steps.push({
      id: 'notice_remaining',
      label: RESIDENT_STORY_LABELS.remainingNoticeCharge,
      amountPaise: remainingNotice,
    });
    steps.push({
      id: 'notice_from_deposit',
      label: RESIDENT_STORY_LABELS.takenFromSecurityDeposit,
      amountPaise: notice.fromDepositPaise,
    });
  } else if (remainingNotice > 0) {
    steps.push({
      id: 'notice_remaining',
      label: RESIDENT_STORY_LABELS.remainingNoticeCharge,
      amountPaise: remainingNotice,
    });
  }

  return steps;
}

export function kunalShapedStoryFixtureWaterfall(): CheckoutSettlementWaterfall {
  return {
    engineVersion: 2,
    stay: { checkInDate: '2026-07-01', checkoutDate: '2026-07-21', stayDays: 21 },
    rentBucket: {
      paidPaise: 412_100,
      consumedPaise: 247_200,
      unusedPaise: 164_800,
      dailyRentPaise: 13_733,
    },
    notice: {
      missingNoticeDays: 14,
      fullPaise: 192_300,
      fromUnusedRentPaise: 164_800,
      fromDepositPaise: 27_500,
      unusedRentRemainingPaise: 0,
    },
    depositBucket: {
      collectedPaise: 412_100,
      electricityPaise: 0,
      tailRentPaise: 0,
      otherPaise: 0,
      refundablePaise: 384_600,
    },
    refund: {
      depositPortionPaise: 384_600,
      unusedRentPortionPaise: 0,
      totalPaise: 384_600,
    },
    lines: [],
  };
}
