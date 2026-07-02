import Link from 'next/link';
import { OperationsOpsRowActions } from '@/src/components/admin/operations/OperationsOpsRowActions';
import type { UnifiedOpsFilter, UnifiedOpsItem, UnifiedOperationsQueue } from '@/src/services/unifiedOperationsQueue';
import { paiseToInr } from '@/src/lib/format';

function filterHref(filter: UnifiedOpsFilter): string {
  if (filter === 'all') return '/admin/operations';
  return `/admin/operations?filter=${filter}`;
}

function OutstandingBreakdown({ item }: { item: UnifiedOpsItem }) {
  const lines = item.outstandingLines ?? [];
  if (lines.length === 0) return <span className="text-apg-silver">—</span>;

  const total = item.totalOutstandingPaise ?? lines.reduce((sum, line) => sum + line.amountPaise, 0);

  return (
    <div className="space-y-2 text-sm">
      <dl className="space-y-1.5">
        {lines.map((line) => (
          <div key={`${line.kind}-${line.categoryLabel}-${line.periodLabel}`} className="grid grid-cols-[88px_1fr_auto] gap-x-3 gap-y-0.5">
            <dt className="font-medium text-white">{line.categoryLabel}</dt>
            <dd className="text-apg-silver">{line.periodLabel}</dd>
            <dd className="text-right font-medium text-white">{paiseToInr(line.amountPaise)}</dd>
          </div>
        ))}
      </dl>
      {lines.length > 1 ? (
        <div className="grid grid-cols-[88px_1fr_auto] gap-x-3 border-t border-white/10 pt-2 text-sm font-semibold">
          <span className="col-span-2 text-white">Total outstanding</span>
          <span className="text-right text-[#FF5A1F]">{paiseToInr(total)}</span>
        </div>
      ) : null}
    </div>
  );
}

export function OperationsMasterQueue({
  data,
  isSuperAdmin = false,
}: {
  data: UnifiedOperationsQueue;
  isSuperAdmin?: boolean;
}) {
  const activeFilter = data.filter ?? 'all';

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/10 bg-[#1A1F27] px-6 py-6">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Operations</h1>
        <p className="mt-2 max-w-3xl text-sm text-apg-silver">
          Every row is an admin action — approve, assign, collect, or complete checkout. Nothing else.
        </p>
        <p className="mt-3 text-sm font-medium text-white">
          {data.items.length === 0
            ? 'All clear — no admin actions waiting.'
            : `${data.items.length} item${data.items.length === 1 ? '' : 's'} in this view · ${data.totalCount} total`}
        </p>
      </section>

      <section className="flex flex-wrap gap-2">
        {data.filterCounts.map((chip) => {
          const selected = (activeFilter === 'all' && chip.id === 'all') || activeFilter === chip.id;
          return (
            <Link
              key={chip.id}
              href={filterHref(chip.id)}
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

      {data.items.length === 0 ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-8 py-16 text-center">
          <p className="text-xl font-semibold text-emerald-100">Nothing in this queue</p>
          <p className="mt-2 text-sm text-emerald-200/80">
            {activeFilter === 'move_out' || activeFilter === 'checkout' || activeFilter === 'refund'
              ? 'No move-outs or refunds awaiting action.'
              : activeFilter === 'payment_proof' || activeFilter === 'waiting_for_admin_review'
                ? 'Use the payment approval panel above to review uploaded screenshots.'
                : 'Try another filter or check Billing Centre for financial summaries.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#141820] text-[10px] uppercase tracking-wide text-apg-silver">
              <tr>
                <th className="px-4 py-3 font-medium">Resident</th>
                <th className="px-4 py-3 font-medium">PG</th>
                <th className="px-4 py-3 font-medium">Room / bed</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Outstanding</th>
                <th className="px-4 py-3 font-medium text-right">Primary action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-[#1A1F27]">
              {data.items.map((item) => (
                <OpsRow key={item.id} item={item} isSuperAdmin={isSuperAdmin} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OpsRow({ item, isSuperAdmin }: { item: UnifiedOpsItem; isSuperAdmin: boolean }) {
  const location = [
    item.roomNumber ? `R${item.roomNumber}` : null,
    item.bedCode ? `Bed ${item.bedCode}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const hasPaymentLines = Boolean(item.outstandingLines?.length);

  return (
    <tr className="transition hover:bg-white/[0.02]">
      <td className="px-4 py-4 font-medium text-white">{item.residentName}</td>
      <td className="px-4 py-4 text-apg-silver">{item.pgName ?? '—'}</td>
      <td className="px-4 py-4 text-apg-silver">{location || '—'}</td>
      <td className="px-4 py-4 text-apg-silver">{item.reason}</td>
      <td className="px-4 py-4 text-white">
        {hasPaymentLines ? <OutstandingBreakdown item={item} /> : '—'}
      </td>
      <td className="px-4 py-4">
        <OperationsOpsRowActions item={item} isSuperAdmin={isSuperAdmin} />
      </td>
    </tr>
  );
}
