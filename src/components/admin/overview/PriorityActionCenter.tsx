import Link from 'next/link';
import type { ResidentsQueueRow } from '@/src/lib/residents/residentOperationsResidentsView';

const PRIMARY =
  'inline-flex items-center justify-center rounded-lg bg-[#FF5A1F] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(255,90,31,0.3)] hover:brightness-110';

export function PriorityActionCenter({
  nextItem,
  queueCount,
  topItems,
}: {
  nextItem: ResidentsQueueRow | null;
  queueCount: number;
  topItems: ResidentsQueueRow[];
}) {
  if (queueCount === 0) {
    return (
      <section className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-5">
        <h2 className="text-sm font-semibold text-emerald-100">Priority Action Center</h2>
        <p className="mt-2 text-sm text-emerald-200/85">All clear — no residents waiting on admin action.</p>
      </section>
    );
  }

  const waitingCount = Math.max(0, queueCount - 1);

  return (
    <section className="rounded-xl border border-[#FF5A1F]/35 bg-[#FF5A1F]/8 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Priority Action Center</h2>
          <p className="text-xs text-apg-silver">
            {queueCount} resident{queueCount === 1 ? '' : 's'} need attention
          </p>
        </div>
        <Link
          href="/admin/operations/residents"
          className="text-xs font-medium text-[#FF5A1F] hover:underline"
        >
          View full queue →
        </Link>
      </div>

      {nextItem ? (
        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-200">Do this now</p>
          <p className="mt-1 text-lg font-semibold text-white">{nextItem.residentName}</p>
          <p className="mt-0.5 text-sm text-apg-silver">
            {nextItem.currentState} — {nextItem.nextAction}
          </p>
          {nextItem.pgName ? (
            <p className="mt-1 text-xs text-apg-silver/80">
              {nextItem.pgName}
              {nextItem.roomNumber ? ` · R${nextItem.roomNumber}` : ''}
              {nextItem.bedCode ? ` · ${nextItem.bedCode}` : ''}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link href={nextItem.primaryHref} className={PRIMARY}>
              {nextItem.primaryActionLabel}
            </Link>
            {waitingCount > 0 ? (
              <span className="text-xs text-apg-silver">+{waitingCount} more below</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {topItems.length > 1 ? (
        <ul className="mt-4 space-y-2">
          {topItems.slice(1, 5).map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/15 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{item.residentName}</p>
                <p className="text-[10px] text-apg-silver">
                  {item.nextAction}
                  {item.pgName ? ` · ${item.pgName}` : ''}
                </p>
              </div>
              <Link
                href={item.primaryHref}
                className="shrink-0 text-xs font-medium text-indigo-300 hover:text-indigo-200"
              >
                Open →
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
