import Link from 'next/link';
import { paiseToInr, formatDate } from '@/src/lib/format';
import { labelDepositCollectionStatus } from '@/src/lib/depositCollectionLabels';
import type { OutstandingDepositRow } from '@/src/services/depositCollection';

export function OutstandingDepositsPanel({ rows }: { rows: OutstandingDepositRow[] }) {
  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-sm font-semibold text-white">Outstanding deposits</h2>
        <p className="mt-2 text-sm text-apg-silver">No partial deposit balances due.</p>
      </section>
    );
  }

  const totalDue = rows.reduce((acc, r) => acc + r.depositDuePaise, 0);
  const overdueCount = rows.filter((r) => r.depositCollectionStatus === 'overdue').length;

  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Outstanding deposits</h2>
          <p className="mt-1 text-xs text-apg-silver">
            {rows.length} resident{rows.length === 1 ? '' : 's'} · {paiseToInr(totalDue)} due
            {overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}
          </p>
        </div>
        <Link
          href="/admin/deposits?filter=due"
          className="text-xs font-semibold text-apg-orange hover:underline"
        >
          View all →
        </Link>
      </div>
      <ul className="mt-4 space-y-2">
        {rows.slice(0, 6).map((r) => (
          <li
            key={r.bookingId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          >
            <div>
              <Link
                href={`/admin/residents/${r.customerId}`}
                className="font-medium text-white hover:text-apg-orange"
              >
                {r.customerFullName}
              </Link>
              <p className="text-[11px] text-apg-silver">
                {r.pgName} · {r.roomNumber}/{r.bedCode}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-amber-300">{paiseToInr(r.depositDuePaise)}</p>
              <p className="text-[10px] text-apg-silver">
                {labelDepositCollectionStatus(r.depositCollectionStatus)}
                {r.depositDueDate ? ` · ${formatDate(r.depositDueDate)}` : ''}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
