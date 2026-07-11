import Link from 'next/link';
import { OperationsOpsRowActions } from '@/src/components/admin/operations/OperationsOpsRowActions';
import { OperationsWaitingForApprovalTable } from '@/src/components/admin/operations/OperationsWaitingForApprovalTable';
import { OperationsRejectedPaymentsSection } from '@/src/components/admin/operations/OperationsRejectedPaymentsSection';
import { OPS_QUEUE_LABELS, operationsFilterHref, type OpsQueueFilter } from '@/src/lib/operations/operationsFilterLinks';
import type { UnifiedOpsItem, UnifiedOperationsQueue } from '@/src/services/unifiedOperationsQueue';
import type { PaymentProofRejectionHistoryRow } from '@/src/services/paymentProofRejectionService';
import { paiseToInr } from '@/src/lib/format';
import { billingMonthLabel } from '@/src/lib/billing/invoiceCollectionWhatsApp';

function OutstandingCell({ item }: { item: UnifiedOpsItem }) {
  const lines = item.outstandingLines ?? [];
  if (lines.length === 0 && item.amountPaise != null) {
    return <span className="font-medium text-white">{paiseToInr(item.amountPaise)}</span>;
  }
  if (lines.length === 0) return <span className="text-apg-silver">—</span>;
  const line = lines[0]!;
  return (
    <div className="text-sm">
      <p className="font-medium text-white">{paiseToInr(line.amountPaise)}</p>
      <p className="text-apg-silver">{line.periodLabel}</p>
    </div>
  );
}

export function OperationsMasterQueue({
  data,
  isSuperAdmin = false,
  recentRejections = [],
}: {
  data: UnifiedOperationsQueue;
  isSuperAdmin?: boolean;
  recentRejections?: PaymentProofRejectionHistoryRow[];
}) {
  const activeFilter = data.filter;

  if (activeFilter === 'waiting_for_approval') {
    return (
      <div className="space-y-8">
        <QueueHeader activeFilter={activeFilter} filterCounts={data.filterCounts} />
        <OperationsWaitingForApprovalTable
          items={data.paymentReviews}
          focusKey={data.focusReviewKey}
        />
        <OperationsRejectedPaymentsSection rows={recentRejections} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <QueueHeader activeFilter={activeFilter} filterCounts={data.filterCounts} />

      {data.items.length === 0 ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-8 py-16 text-center">
          <p className="text-xl font-semibold text-emerald-100">Nothing in this queue</p>
          <p className="mt-2 text-sm text-emerald-200/80">No admin action required right now.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#141820] text-[10px] uppercase tracking-wide text-apg-silver">
              <tr>
                {columnsForFilter(activeFilter).map((col) => (
                  <th
                    key={col}
                    className={
                      'px-4 py-3 font-medium' + (col === 'actions' ? ' text-right' : '')
                    }
                  >
                    {columnLabel(col, activeFilter)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-[#1A1F27]">
              {data.items.map((item) => (
                <OpsRow
                  key={item.id}
                  item={item}
                  filter={activeFilter}
                  isSuperAdmin={isSuperAdmin}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type ColumnKey =
  | 'resident'
  | 'pg'
  | 'room'
  | 'reason'
  | 'amount'
  | 'month'
  | 'status'
  | 'booking'
  | 'required'
  | 'already_paid'
  | 'remaining'
  | 'actions';

function columnsForFilter(filter: OpsQueueFilter): ColumnKey[] {
  switch (filter) {
    case 'rent_due':
      return ['resident', 'room', 'month', 'amount', 'reason', 'actions'];
    case 'electricity_due':
      return ['resident', 'month', 'amount', 'reason', 'actions'];
    case 'vacating_requests':
      return ['resident', 'room', 'reason', 'actions'];
    case 'refund_due':
      return ['resident', 'amount', 'booking', 'status', 'actions'];
    case 'booking_approval':
      return ['resident', 'booking', 'status', 'actions'];
    case 'deposit_due':
      return ['resident', 'required', 'already_paid', 'remaining', 'actions'];
    case 'kyc_review':
      return ['resident', 'pg', 'room', 'reason', 'actions'];
    default:
      return ['resident', 'pg', 'room', 'reason', 'actions'];
  }
}

function columnLabel(col: ColumnKey, filter: OpsQueueFilter): string {
  if (col === 'required') return 'Required deposit';
  if (col === 'already_paid') return 'Already paid';
  if (col === 'remaining') return 'Remaining due';
  if (col === 'month') return filter === 'electricity_due' ? 'Month' : 'Rent month';
  if (col === 'amount') return 'Amount';
  if (col === 'room') return 'Room / bed';
  if (col === 'booking') return 'Booking';
  if (col === 'status') return 'Status';
  if (col === 'reason') return 'Reason';
  if (col === 'actions') return 'Actions';
  if (col === 'pg') return 'PG';
  return 'Resident';
}

function QueueHeader({
  activeFilter,
  filterCounts,
}: {
  activeFilter: OpsQueueFilter;
  filterCounts: UnifiedOperationsQueue['filterCounts'];
}) {
  const activeCount = filterCounts.find((c) => c.id === activeFilter)?.count ?? 0;
  const activeLabel = OPS_QUEUE_LABELS[activeFilter];

  return (
    <>
      <section className="rounded-2xl border border-white/10 bg-[#1A1F27] px-6 py-6">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Operations</h1>
        <p className="mt-2 max-w-3xl text-sm text-apg-silver">
          Action center — one queue per decision. Overdue is a label on rent and electricity rows,
          not a separate queue.
        </p>
        <p className="mt-3 text-sm font-medium text-white">
          {activeCount === 0
            ? `All clear — nothing in ${activeLabel.toLowerCase()}.`
            : `${activeCount} item${activeCount === 1 ? '' : 's'} in ${activeLabel.toLowerCase()}`}
        </p>
      </section>

      <section className="flex flex-wrap gap-2">
        {filterCounts.map((chip) => {
          const selected = activeFilter === chip.id;
          return (
            <Link
              key={chip.id}
              href={operationsFilterHref(chip.id)}
              className={
                'rounded-full px-3 py-1.5 text-xs font-medium transition ' +
                (selected
                  ? 'bg-[#FF5A1F] text-white'
                  : 'border border-white/10 text-apg-silver hover:text-white')
              }
            >
              {chip.label} ({chip.count})
            </Link>
          );
        })}
      </section>
    </>
  );
}

function OpsRow({
  item,
  filter,
  isSuperAdmin,
}: {
  item: UnifiedOpsItem;
  filter: OpsQueueFilter;
  isSuperAdmin: boolean;
}) {
  const location = [
    item.roomNumber ? `R${item.roomNumber}` : null,
    item.bedCode ? `Bed ${item.bedCode}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const monthLabel = item.billingMonth ? billingMonthLabel(item.billingMonth) : '—';

  const cells: Record<ColumnKey, React.ReactNode> = {
    resident: <span className="font-medium text-white">{item.residentName}</span>,
    pg: <span className="text-apg-silver">{item.pgName ?? '—'}</span>,
    room: <span className="text-apg-silver">{location || '—'}</span>,
    reason: <span className="text-apg-silver">{item.reason}</span>,
    amount: <OutstandingCell item={item} />,
    month: <span className="text-apg-silver">{monthLabel}</span>,
    status: <span className="text-apg-silver">{item.statusLabel ?? '—'}</span>,
    booking: <span className="font-mono text-apg-silver">{item.bookingCode ?? '—'}</span>,
    required: (
      <span className="font-medium text-white">
        {item.depositRequiredPaise != null ? paiseToInr(item.depositRequiredPaise) : '—'}
      </span>
    ),
    already_paid: (
      <span className="text-apg-silver">
        {item.depositPaidPaise != null ? paiseToInr(item.depositPaidPaise) : '—'}
      </span>
    ),
    remaining: (
      <span className="font-medium text-[#FF5A1F]">
        {item.depositRemainingPaise != null ? paiseToInr(item.depositRemainingPaise) : '—'}
      </span>
    ),
    actions: (
      <OperationsOpsRowActions
        item={item}
        isSuperAdmin={isSuperAdmin}
        showWhatsApp={filter === 'rent_due' || filter === 'electricity_due' || filter === 'deposit_due'}
      />
    ),
  };

  return (
    <tr className="transition hover:bg-white/[0.02]">
      {columnsForFilter(filter).map((col) => (
        <td key={col} className={'px-4 py-4' + (col === 'actions' ? '' : '')}>
          {col === 'actions' ? (
            <div className="flex justify-end">{cells[col]}</div>
          ) : (
            cells[col]
          )}
        </td>
      ))}
    </tr>
  );
}
