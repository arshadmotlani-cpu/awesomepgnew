'use client';

import { useMemo, useState } from 'react';
import { MoveOutCommandCenter } from '@/src/components/admin/moveOut/MoveOutCommandCenter';
import { MoveOutPipelineQueue } from '@/src/components/admin/moveOut/MoveOutPipelineQueue';
import type { MoveOutPipelineItemClient } from '@/src/lib/moveOut/moveOutPipeline';
import type { MoveOutCommandStats, MoveOutFilterBucket } from '@/src/lib/moveOut/moveOutPipelineUi';
import type { VacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';

export function MoveOutWorkflowPanel({
  activeItems,
  completedRecently,
  commandStats,
  approvalPreviewByRequestId,
}: {
  activeItems: MoveOutPipelineItemClient[];
  completedRecently: MoveOutPipelineItemClient[];
  commandStats: MoveOutCommandStats;
  approvalPreviewByRequestId?: Record<string, VacatingApprovalPreview>;
}) {
  const [filter, setFilter] = useState<MoveOutFilterBucket>('all');

  const showCompletedSection = filter === 'all' || filter === 'completed';

  const completedItems = useMemo(() => {
    if (!showCompletedSection) return [];
    if (filter === 'completed') return completedRecently;
    return completedRecently;
  }, [completedRecently, filter, showCompletedSection]);

  const activeQueueItems = useMemo(() => {
    if (filter === 'completed') return [];
    return activeItems;
  }, [activeItems, filter]);

  return (
    <>
      <MoveOutCommandCenter
        stats={commandStats}
        activeFilter={filter}
        onFilterChange={setFilter}
      />

      <MoveOutPipelineQueue
        items={activeQueueItems}
        filter={filter}
        approvalPreviewByRequestId={approvalPreviewByRequestId}
      />

      {showCompletedSection && completedItems.length > 0 ? (
        <section className="mb-8">
          <header className="mb-4">
            <h2 className="text-lg font-bold text-white">Recently completed</h2>
            <p className="mt-1 text-sm text-apg-silver">
              Move-outs finished — bed released and checkout closed.
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
