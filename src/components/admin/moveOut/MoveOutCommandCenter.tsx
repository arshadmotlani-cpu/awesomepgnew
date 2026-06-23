'use client';

import type { MoveOutCommandStats, MoveOutFilterBucket } from '@/src/lib/moveOut/moveOutPipelineUi';
import { MOVE_OUT_FILTER_BUCKETS } from '@/src/lib/moveOut/moveOutPipelineUi';

export function MoveOutCommandCenter({
  stats,
  activeFilter,
  onFilterChange,
}: {
  stats: MoveOutCommandStats;
  activeFilter: MoveOutFilterBucket;
  onFilterChange: (filter: MoveOutFilterBucket) => void;
}) {
  const countFor = (id: MoveOutFilterBucket): number => {
    switch (id) {
      case 'needs_action':
        return stats.needsAction;
      case 'waiting_resident':
        return stats.waitingResident;
      case 'overdue':
        return stats.overdue;
      case 'refunds_to_send':
        return stats.refundsToSend;
      case 'completed':
        return stats.completed;
      default:
        return 0;
    }
  };

  return (
    <section className="mb-8">
      <header className="mb-4">
        <h2 className="text-xl font-bold text-white">Move-out command center</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Operator task buckets — filter the queue by what needs you today.
          {stats.pendingApproval > 0 ? (
            <span className="ml-1 text-amber-200">
              {stats.pendingApproval} awaiting move-out approval.
            </span>
          ) : null}
        </p>
      </header>
      <div className="flex flex-wrap gap-2">
        <FilterTab
          label="All active"
          count={stats.needsAction + stats.waitingResident + stats.overdue + stats.refundsToSend}
          active={activeFilter === 'all'}
          onClick={() => onFilterChange('all')}
        />
        {MOVE_OUT_FILTER_BUCKETS.map((bucket) => (
          <FilterTab
            key={bucket.id}
            label={bucket.label}
            count={countFor(bucket.id)}
            active={activeFilter === bucket.id}
            onClick={() => onFilterChange(bucket.id)}
            accent={bucketAccent(bucket.id)}
          />
        ))}
      </div>
    </section>
  );
}

function bucketAccent(
  id: MoveOutFilterBucket,
): 'action' | 'wait' | 'overdue' | 'refund' | 'done' | undefined {
  switch (id) {
    case 'needs_action':
      return 'action';
    case 'waiting_resident':
      return 'wait';
    case 'overdue':
      return 'overdue';
    case 'refunds_to_send':
      return 'refund';
    case 'completed':
      return 'done';
    default:
      return undefined;
  }
}

function FilterTab({
  label,
  count,
  active,
  onClick,
  accent,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  accent?: 'action' | 'wait' | 'overdue' | 'refund' | 'done';
}) {
  const countTone =
    accent === 'overdue'
      ? 'text-rose-300'
      : accent === 'refund'
        ? 'text-amber-200'
        : accent === 'done'
          ? 'text-emerald-300'
          : accent === 'action'
            ? 'text-[#FF5A1F]'
            : 'text-white';

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-xl border px-4 py-3 text-left transition ' +
        (active
          ? 'border-[#FF5A1F]/50 bg-[#FF5A1F]/10 ring-1 ring-[#FF5A1F]/30'
          : 'border-white/10 bg-[#1A1F27] hover:border-white/20 hover:bg-white/[0.03]')
      }
    >
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
        {label}
      </span>
      <span className={`mt-1 block text-2xl font-bold tabular-nums ${countTone}`}>{count}</span>
    </button>
  );
}
