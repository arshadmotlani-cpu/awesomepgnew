import {
  operationsFilterHref,
  type OpsQueueFilter,
} from '@/src/lib/operations/operationsFilterLinks';

export type OperationsAttentionCard = {
  id: string;
  label: string;
  count: number;
  href: string;
};

export function buildOperationsAttentionCards(
  filterCounts: Array<{ id: OpsQueueFilter; label: string; count: number }>,
  dateChangeCount: number,
): OperationsAttentionCard[] {
  const countByFilter = Object.fromEntries(filterCounts.map((c) => [c.id, c.count])) as Record<
    OpsQueueFilter,
    number
  >;

  const cards: OperationsAttentionCard[] = [];

  if (dateChangeCount > 0) {
    cards.push({
      id: 'date_change',
      label: 'Move-out date changes',
      count: dateChangeCount,
      href: operationsFilterHref('vacating_requests'),
    });
  }

  const vacatingTotal = countByFilter.vacating_requests ?? 0;
  const vacatingOther = Math.max(0, vacatingTotal - dateChangeCount);
  if (vacatingOther > 0) {
    cards.push({
      id: 'vacating_other',
      label: 'Move-out actions',
      count: vacatingOther,
      href: operationsFilterHref('vacating_requests'),
    });
  }

  const push = (id: OpsQueueFilter, label: string) => {
    const count = countByFilter[id] ?? 0;
    if (count <= 0) return;
    cards.push({ id, label, count, href: operationsFilterHref(id) });
  };

  push('waiting_for_approval', 'Payment proofs');
  push('refund_due', 'Payouts pending');
  push('booking_approval', 'Booking approvals');
  push('kyc_review', 'KYC review');
  push('rent_due', 'Rent due');
  push('electricity_due', 'Electricity due');
  push('deposit_due', 'Deposit due');

  return cards;
}
