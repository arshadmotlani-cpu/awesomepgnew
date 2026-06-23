import Link from 'next/link';
import type { ResidentsQueueRow } from '@/src/lib/residents/residentOperationsResidentsView';

const PRIMARY =
  'inline-flex items-center justify-center rounded-lg bg-[#FF5A1F] px-6 py-3 text-base font-semibold text-white shadow-[0_0_24px_rgba(255,90,31,0.35)] hover:brightness-110';

export function OperationsHomeHero({
  nextItem,
  queueCount,
}: {
  nextItem: ResidentsQueueRow | null;
  queueCount: number;
}) {
  if (!nextItem || queueCount === 0) {
    return (
      <section className="mb-6 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-5 py-6">
        <p className="text-lg font-semibold text-emerald-100">All clear</p>
        <p className="mt-1 text-sm text-emerald-200/85">No residents waiting on admin action right now.</p>
      </section>
    );
  }

  const waitingCount = Math.max(0, queueCount - 1);

  return (
    <section className="mb-6 rounded-2xl border border-[#FF5A1F]/40 bg-[#FF5A1F]/10 px-5 py-6">
      <p className="text-[11px] font-bold uppercase tracking-wider text-orange-200">Do this now</p>
      <p className="mt-2 text-xl font-semibold text-white">{nextItem.residentName}</p>
      <p className="mt-1 text-sm text-apg-silver">
        {nextItem.currentState} — {nextItem.nextAction}
      </p>
      {nextItem.pgName ? (
        <p className="mt-1 text-xs text-apg-silver/80">
          {nextItem.pgName}
          {nextItem.roomNumber ? ` · R${nextItem.roomNumber}` : ''}
          {nextItem.bedCode ? ` · ${nextItem.bedCode}` : ''}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link href={nextItem.primaryHref} className={PRIMARY}>
          {nextItem.primaryActionLabel}
        </Link>
        {waitingCount > 0 ? (
          <Link href="#queue" className="text-sm font-medium text-apg-silver hover:text-white">
            +{waitingCount} more in queue →
          </Link>
        ) : null}
      </div>
    </section>
  );
}
