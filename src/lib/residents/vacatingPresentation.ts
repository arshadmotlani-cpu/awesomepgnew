import { formatDate } from '@/src/lib/format';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';
import { VACATING_JOURNEY_STAGES, vacatingStageIndex } from '@/src/lib/residents/vacatingJourney';

/** Display-only helpers for vacating journey UI. */
export function estimateRefundPaise(
  depositHeldPaise: number,
  vacating: VacatingForBookingRow | null,
): number | null {
  if (vacating?.status === 'completed' && vacating.depositRefundPaise > 0) {
    return vacating.depositRefundPaise;
  }
  if (depositHeldPaise <= 0) return null;
  if (!vacating || !['pending', 'approved'].includes(vacating.status)) return null;
  const deduction = vacating.deductionPaise ?? 0;
  return Math.max(0, depositHeldPaise - deduction);
}

export function expectedCompletionLabel(input: {
  vacating: VacatingForBookingRow | null;
  checkoutStatus: string | null;
}): string | null {
  const { vacating, checkoutStatus } = input;

  if (checkoutStatus === 'refund_paid' || checkoutStatus === 'completed') {
    return 'Move-out complete';
  }
  if (checkoutStatus === 'refund_pending' || checkoutStatus === 'awaiting_admin_review') {
    return 'Refund expected within 3–5 working days after review';
  }
  if (checkoutStatus === 'awaiting_resident_details') {
    return 'Complete after you submit meter photo and UPI details';
  }
  if (vacating?.status === 'pending') {
    return 'Expected after the office approves your vacate date';
  }
  if (vacating?.status === 'approved' && vacating.vacatingDate) {
    return `Settlement starts on ${formatDate(vacating.vacatingDate)}`;
  }
  return null;
}

export function currentStageLabel(
  vacatingStatus: string | null,
  checkoutStatus: string | null,
  vacatingDate?: string | null,
): string {
  const index = vacatingStageIndex(vacatingStatus, checkoutStatus, vacatingDate);
  return VACATING_JOURNEY_STAGES[index]?.label ?? 'Move-out';
}
