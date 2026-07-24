'use client';

import { useMemo, useState } from 'react';
import { MoveOutCommandCenter } from '@/src/components/admin/moveOut/MoveOutCommandCenter';
import { MoveOutPipelineQueue } from '@/src/components/admin/moveOut/MoveOutPipelineQueue';
import type { MoveOutPipelineItemClient } from '@/src/lib/moveOut/moveOutPipeline';
import type { MoveOutCommandStats, MoveOutWorkflowFilter } from '@/src/lib/moveOut/moveOutPipelineUi';
import type { MoveOutWorkflowStageId } from '@/src/lib/moveOut/moveOutWorkflowStages';
import type { VacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';

function parseInitialWorkflowFilter(stage: string | undefined): MoveOutWorkflowFilter {
  const allowed: MoveOutWorkflowFilter[] = [
    'all',
    'pending_request',
    'waiting_vacating_date',
    'settlement_review',
    'refund_ready',
    'completed',
  ];
  if (stage && allowed.includes(stage as MoveOutWorkflowFilter)) {
    return stage as MoveOutWorkflowFilter;
  }
  return 'all';
}

export function MoveOutWorkflowPanel({
  activeItems,
  completedRecently,
  commandStats,
  approvalPreviewByRequestId,
  initialStage,
}: {
  activeItems: MoveOutPipelineItemClient[];
  completedRecently: MoveOutPipelineItemClient[];
  commandStats: MoveOutCommandStats;
  approvalPreviewByRequestId?: Record<string, VacatingApprovalPreview>;
  initialStage?: MoveOutWorkflowStageId;
}) {
  const [filter, setFilter] = useState<MoveOutWorkflowFilter>(() =>
    parseInitialWorkflowFilter(initialStage),
  );

  const showCompletedSection = filter === 'all' || filter === 'completed';

  const completedItems = useMemo(() => {
    if (!showCompletedSection) return [];
    return completedRecently;
  }, [completedRecently, showCompletedSection]);

  const activeQueueItems = useMemo(() => {
    if (filter === 'completed') return [];
    return activeItems;
  }, [activeItems, filter]);

  return (
    <>
      <MoveOutCommandCenter stats={commandStats} activeFilter={filter} onFilterChange={setFilter} />

      <MoveOutPipelineQueue
        items={activeQueueItems}
        filter={filter}
        approvalPreviewByRequestId={approvalPreviewByRequestId}
      />

      {showCompletedSection && completedItems.length > 0 ? (
        <section className="mb-8">
          <header className="mb-4">
            <h2 className="text-lg font-bold text-white">Completed</h2>
            <p className="mt-1 text-sm text-apg-silver">
              Move-outs finished — searchable here; they no longer appear in Operations or
              notifications.
            </p>
          </header>
          <MoveOutPipelineQueue
            items={completedItems}
            filter={filter}
            completedSection
            approvalPreviewByRequestId={approvalPreviewByRequestId}
          />
        </section>
      ) : null}
    </>
  );
}
