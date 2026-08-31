/**
 * Post room-transfer monthly rent — uses billing-month pricing, not transfer-day pricing.
 * Preserves frozen room-change quote (transfer date) while ongoing rent uses effective rates.
 */

import { formatDate, parseDate } from '@/src/lib/dates';
import { loadBedPrice } from '@/src/services/pricing';

/** Billing anchor for snapshot after transfer — first day of next month when transfer is on month-end. */
export function postTransferBillingAnchorDate(transferDate: string): string {
  const d = parseDate(transferDate);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = d.getUTCDate();
  if (day === lastDayOfMonth) {
    return formatDate(new Date(Date.UTC(year, month + 1, 1)));
  }
  return transferDate;
}

export async function resolvePostTransferMonthlyRentPaise(
  bedId: string,
  transferDate: string,
): Promise<number | null> {
  const anchor = postTransferBillingAnchorDate(transferDate);
  const price = await loadBedPrice(bedId, anchor);
  return price?.monthlyRatePaise ?? null;
}
