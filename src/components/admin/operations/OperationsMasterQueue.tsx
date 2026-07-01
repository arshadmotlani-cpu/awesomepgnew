import Link from 'next/link';
import { AdminTableScroll } from '@/src/components/admin/AdminTableScroll';
import type { UnifiedOpsFilter, UnifiedOpsItem, UnifiedOperationsQueue } from '@/src/services/unifiedOperationsQueue';
import { paiseToInr } from '@/src/lib/format';

const PRIORITY_STYLES: Record<
  UnifiedOpsItem['priority'],
  { badge: string; label: string }
> = {
  urgent: { badge: 'bg-rose-500/15 text-rose-300', label: 'Urgent' },
  high: { badge: 'bg-amber-500/15 text-amber-300', label: 'High' },
  normal: { badge: 'bg-sky-500/15 text-sky-300', label: 'Normal' },
  waiting: { badge: 'bg-zinc-500/15 text-zinc-300', label: 'Waiting on resident' },
};

function filterHref(filter: UnifiedOpsFilter): string {
  if (filter === 'all') return '/admin/operations';
  return `/admin/operations?filter=${filter}`;
}

export function OperationsMasterQueue({ data }: { data: UnifiedOperationsQueue }) {
  const activeFilter = data.filter ?? 'all';

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/10 bg-[#1A1F27] px-6 py-6">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Operations</h1>
        <p className="mt-2 max-w-3xl text-sm text-apg-silver">
          Single command center for every action that needs you — billing, KYC, move-outs, bookings,
          and more. Filter below; nothing is hidden on other pages.
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
            Try another filter or check Billing Centre for financial summaries.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {data.items.map((item) => (
              <OpsMobileCard key={item.id} item={item} />
            ))}
          </div>

          <AdminTableScroll
            className="hidden rounded-2xl border border-white/10 md:block"
            hint="Swipe sideways to see Status, Next action, and Open."
          >
            <table className="min-w-[960px] w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-[#141820] text-[10px] uppercase tracking-wide text-apg-silver">
                <tr>
                  <th className="px-4 py-3 font-medium">Resident</th>
                  <th className="px-4 py-3 font-medium">PG</th>
                  <th className="px-4 py-3 font-medium">Room / bed</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Next action</th>
                  <th className="px-4 py-3 font-medium text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-[#1A1F27]">
                {data.items.map((item) => (
                  <OpsRow key={item.id} item={item} />
                ))}
              </tbody>
            </table>
          </AdminTableScroll>
        </>
      )}
    </div>
  );
}

function locationLabel(item: UnifiedOpsItem): string {
  const parts = [
    item.roomNumber ? `R${item.roomNumber}` : null,
    item.bedCode ? `Bed ${item.bedCode}` : null,
  ].filter(Boolean);
  return parts.join(' · ') || '—';
}

function PriorityBadge({ priority }: { priority: UnifiedOpsItem['priority'] }) {
  const p = PRIORITY_STYLES[priority];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${p.badge}`}>
      {p.label}
    </span>
  );
}

function NextActionContent({ item }: { item: UnifiedOpsItem }) {
  if (item.outstandingLines && item.outstandingLines.length > 0) {
    return (
      <div>
        <p className="text-xs text-apg-silver">Outstanding</p>
        <ul className="mt-1 space-y-0.5 text-sm">
          {item.outstandingLines.map((line) => (
            <li key={`${line.kind}-${line.label}`}>
              {line.financialInvoiceId ? (
                <Link
                  href={`/admin/invoices/${line.financialInvoiceId}`}
                  className="text-[#FF5A1F] hover:underline"
                >
                  • {line.label} {paiseToInr(line.amountPaise)}
                </Link>
              ) : (
                <span>
                  • {line.label} {paiseToInr(line.amountPaise)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return <>{item.nextAction}</>;
}

function OpsMobileCard({ item }: { item: UnifiedOpsItem }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[#1A1F27] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-semibold text-white">{item.residentName}</p>
          <p className="mt-0.5 text-xs text-apg-silver">{item.pgName ?? '—'}</p>
          <p className="mt-0.5 text-xs text-apg-silver">Room / bed: {locationLabel(item)}</p>
        </div>
        <PriorityBadge priority={item.priority} />
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">Status</dt>
          <dd className="mt-0.5 text-white/90">{item.status}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">Next action</dt>
          <dd className="mt-0.5 text-white">
            <NextActionContent item={item} />
          </dd>
        </div>
      </dl>

      <Link
        href={item.openHref}
        className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
      >
        {item.openLabel}
      </Link>
    </article>
  );
}

function OpsRow({ item }: { item: UnifiedOpsItem }) {
  return (
    <tr className="transition hover:bg-white/[0.02]">
      <td className="px-4 py-4 font-medium text-white">{item.residentName}</td>
      <td className="px-4 py-4 text-apg-silver">{item.pgName ?? '—'}</td>
      <td className="px-4 py-4 text-apg-silver">{locationLabel(item)}</td>
      <td className="px-4 py-4">
        <PriorityBadge priority={item.priority} />
      </td>
      <td className="px-4 py-4 text-apg-silver">{item.status}</td>
      <td className="px-4 py-4 text-white">
        <NextActionContent item={item} />
      </td>
      <td className="px-4 py-4 text-right">
        <Link
          href={item.openHref}
          className="inline-flex min-h-[36px] items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2 text-xs font-semibold text-white hover:brightness-110"
        >
          {item.openLabel}
        </Link>
      </td>
    </tr>
  );
}
