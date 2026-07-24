'use client';

import type { MoveOutCommandStats, MoveOutWorkflowFilter } from '@/src/lib/moveOut/moveOutPipelineUi';
import { MOVE_OUT_WORKFLOW_FILTER_TABS } from '@/src/lib/moveOut/moveOutPipelineUi';

export function MoveOutCommandCenter({
  stats,
  activeFilter,
  onFilterChange,
}: {
  stats: MoveOutCommandStats;
  activeFilter: MoveOutWorkflowFilter;
  onFilterChange: (filter: MoveOutWorkflowFilter) => void;
}) {
  const countFor = (id: MoveOutWorkflowFilter): number => {
    switch (id) {
      case 'pending_request':
        return stats.pendingRequest;
      case 'waiting_vacating_date':
        return stats.waitingVacatingDate;
      case 'settlement_review':
        return stats.settlementReview;
      case 'refund_ready':
        return stats.refundReady;
      case 'completed':
        return stats.completed;
      default:
        return 0;
    }
  };

  return (
    <section className="mb-8">
      <header className="mb-4">
        <h2 className="text-xl font-bold text-white">Move-out pipeline</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Track every move-out from approval through completion. Operations and notifications only
          surface stages that need admin action now.
          {stats.pendingRequest > 0 ? (
            <span className="ml-1 text-amber-200">
              {stats.pendingRequest} pending move-out request
              {stats.pendingRequest === 1 ? '' : 's'}.
            </span>
          ) : null}
          {stats.needsAction > stats.pendingRequest ? (
            <span className="ml-1 text-[#FF5A1F]">
              {stats.needsAction - stats.pendingRequest} checkout action
              {stats.needsAction - stats.pendingRequest === 1 ? '' : 's'} required.
            </span>
          ) : null}
        </p>
      </header>
      <div className="flex flex-wrap gap-2">
        <FilterTab
          label="All active"
          count={stats.activeCount}
          active={activeFilter === 'all'}
          onClick={() => onFilterChange('all')}
        />
        {MOVE_OUT_WORKFLOW_FILTER_TABS.map((bucket) => (
          <FilterTab
            key={bucket.id}
            label={bucket.label}
            count={countFor(bucket.id)}
            active={activeFilter === bucket.id}
            onClick={() => onFilterChange(bucket.id)}
            accent={stageAccent(bucket.id)}
          />
        ))}
      </div>
    </section>
  );
}

function stageAccent(
  id: MoveOutWorkflowFilter,
): 'action' | 'wait' | 'refund' | 'done' | undefined {
  switch (id) {
    case 'pending_request':
    case 'settlement_review':
      return 'action';
    case 'waiting_vacating_date':
      return 'wait';
    case 'refund_ready':
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
  accent?: 'action' | 'wait' | 'refund' | 'done';
}) {
  const countTone =
    accent === 'refund'
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
