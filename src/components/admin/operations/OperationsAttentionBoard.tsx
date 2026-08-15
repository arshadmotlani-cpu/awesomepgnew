'use client';

import Link from 'next/link';
import { operationsFilterHref } from '@/src/lib/operations/operationsFilterLinks';
import type { OpsQueueFilter } from '@/src/lib/operations/operationsFilterLinks';
import type { VacatingDateChangeRequestClient } from '@/src/lib/operations/vacatingDateChangeClient';
import type { VacatingDateChangeBookingContext } from '@/src/components/admin/vacating/VacatingDateChangeApprovalPanel';
import type { SettlementStatementDocumentModel } from '@/src/lib/vacating/settlementStatementModel';
import { OperationsVacatingDateChangePanels } from '@/src/components/admin/operations/OperationsVacatingDateChangePanels';

type AttentionCard = {
  id: string;
  label: string;
  count: number;
  href: string;
};

export function OperationsAttentionBoard({
  totalCount,
  cards,
  pendingDateChanges,
  dateChangeContextByRequestId,
  statementDocumentByRequestId,
  focusRequestId,
  hideDateChangePanels = false,
}: {
  totalCount: number;
  cards: AttentionCard[];
  pendingDateChanges: VacatingDateChangeRequestClient[];
  dateChangeContextByRequestId: Record<string, VacatingDateChangeBookingContext>;
  statementDocumentByRequestId?: Record<string, SettlementStatementDocumentModel | null>;
  focusRequestId?: string | null;
  hideDateChangePanels?: boolean;
}) {
  const actionableCards = cards.filter((c) => c.count > 0);

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-[#141820] p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Needs your attention</h2>
            <p className="mt-1 text-sm text-apg-silver">
              {totalCount > 0
                ? `${totalCount} item${totalCount === 1 ? '' : 's'} need your action`
                : 'No pending operational actions right now'}
            </p>
          </div>
          {totalCount > 0 ? (
            <span className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full bg-[#FF5A1F] px-2 text-sm font-bold text-white">
              {totalCount > 99 ? '99+' : totalCount}
            </span>
          ) : null}
        </div>

        {actionableCards.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
            {actionableCards.map((card) => (
              <Link
                key={card.id}
                href={card.href}
                className="flex min-h-[100px] flex-col rounded-xl border border-white/10 bg-[#1A1F27] px-3 py-3 transition hover:border-[#FF5A1F]/40"
              >
                <p className="text-[11px] font-medium leading-snug text-apg-silver">{card.label}</p>
                <p className="mt-2 text-3xl font-bold tabular-nums text-[#FF5A1F]">{card.count}</p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-emerald-200/90">All queues are clear.</p>
        )}
      </div>

      {hideDateChangePanels ? null : (
        <OperationsVacatingDateChangePanels
          pendingDateChanges={pendingDateChanges}
          dateChangeContextByRequestId={dateChangeContextByRequestId}
          statementDocumentByRequestId={statementDocumentByRequestId}
          focusRequestId={focusRequestId}
        />
      )}
    </section>
  );
}

export function buildOperationsAttentionCards(
  filterCounts: Array<{ id: OpsQueueFilter; label: string; count: number }>,
  dateChangeCount: number,
): AttentionCard[] {
  const countByFilter = Object.fromEntries(filterCounts.map((c) => [c.id, c.count])) as Record<
    OpsQueueFilter,
    number
  >;

  const cards: AttentionCard[] = [];

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
