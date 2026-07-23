import { formatBillingMonthLabel } from '@/src/lib/billing/formatBillingMonth';
import { parseDate } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

/** Resolve canonical YYYY-MM-01 billing month for a payment review row. */
export function resolvePaymentReviewBillingMonth(input: {
  billingMonth?: string | null;
  moveInDate?: string | null;
  month?: string | null;
}): string | null {
  if (input.billingMonth) return firstOfMonth(input.billingMonth);
  if (input.moveInDate) return firstOfMonth(input.moveInDate);
  if (input.month) return firstOfMonth(input.month);
  return null;
}

function isAnniversaryBillingMode(durationMode: string | null | undefined): boolean {
  return durationMode === 'monthly' || durationMode === 'open_ended';
}

/** Display label for Operations payment review tables. */
export function formatPaymentReviewBillingMonth(
  item: Pick<PendingPaymentReviewItem, 'billingMonth' | 'bookingDetails'>,
): string {
  const billingMonth = resolvePaymentReviewBillingMonth({
    billingMonth: item.billingMonth,
    moveInDate: item.bookingDetails?.moveInDate,
  });
  if (!billingMonth) return '—';

  const moveInDate = item.bookingDetails?.moveInDate;
  const durationMode = item.bookingDetails?.durationMode;

  if (isAnniversaryBillingMode(durationMode) && moveInDate) {
    const d = parseDate(moveInDate);
    const day = d.getUTCDate();
    const shortMonth = d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });
    const year = d.getUTCFullYear();
    return `${day} ${shortMonth} ${year} cycle`;
  }

  return formatBillingMonthLabel(billingMonth);
}
