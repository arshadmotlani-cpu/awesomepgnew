import { todayString, tryDiffDays } from '@/src/lib/dates';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';
import { VACATING_NOTICE_MIN_DAYS, vacatingPenalty } from '@/src/services/billing';

export type DepositRefundEligibility = {
  canRequestRefund: boolean;
  lockReason: string | null;
};

export function getDepositRefundEligibility(args: {
  vacating: VacatingForBookingRow | null;
  today?: string;
}): DepositRefundEligibility {
  const today = args.today ?? todayString();
  const vacating = args.vacating;

  if (!vacating) {
    return {
      canRequestRefund: false,
      lockReason:
        'Submit a vacate request and wait for admin approval before requesting a deposit refund.',
    };
  }

  if (vacating.status === 'pending') {
    return {
      canRequestRefund: false,
      lockReason:
        'Deposit refund unlocks after admin approves your vacate request and your vacate date arrives.',
    };
  }

  if (vacating.status === 'rejected') {
    return {
      canRequestRefund: false,
      lockReason: 'Your vacate request was not approved. Contact the office for help.',
    };
  }

  if (vacating.status !== 'approved' && vacating.status !== 'completed') {
    return {
      canRequestRefund: false,
      lockReason: 'Vacate request must be approved first.',
    };
  }

  if (today < vacating.vacatingDate) {
    return {
      canRequestRefund: false,
      lockReason: `Deposit refund unlocks on your vacate date (${vacating.vacatingDate}).`,
    };
  }

  return { canRequestRefund: true, lockReason: null };
}

export function estimateVacateDepositPreview(args: {
  depositHeldPaise: number;
  monthlyRentPaise: number;
  vacatingDate: string;
  noticeGivenDate?: string;
}) {
  const noticeGivenDate = args.noticeGivenDate ?? todayString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.vacatingDate)) {
    return {
      daysUntilVacate: 0,
      earlyVacate: false,
      estimatedDeductionPaise: 0,
      estimatedRefundablePaise: args.depositHeldPaise,
    };
  }
  const daysUntilVacate = tryDiffDays(noticeGivenDate, args.vacatingDate) ?? 0;
  const earlyVacate = daysUntilVacate < VACATING_NOTICE_MIN_DAYS;
  const estimatedDeductionPaise = earlyVacate ? vacatingPenalty(args.monthlyRentPaise) : 0;
  const estimatedRefundablePaise = Math.max(
    0,
    args.depositHeldPaise - estimatedDeductionPaise,
  );
  return { daysUntilVacate, earlyVacate, estimatedDeductionPaise, estimatedRefundablePaise };
}
