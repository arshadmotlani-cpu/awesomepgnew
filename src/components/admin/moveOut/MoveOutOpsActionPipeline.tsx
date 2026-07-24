'use client';

import Link from 'next/link';
import type { MoveOutPipelineItemClient } from '@/src/lib/moveOut/moveOutPipeline';
import { vacatingPipelineHref } from '@/src/lib/moveOut/moveOutPipelineUi';
import type { VacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';
import { MoveOutPipelineQueue } from '@/src/components/admin/moveOut/MoveOutPipelineQueue';

export function MoveOutOpsActionPipeline({
  items,
  approvalPreviewByRequestId,
}: {
  items: MoveOutPipelineItemClient[];
  approvalPreviewByRequestId?: Record<string, VacatingApprovalPreview>;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-apg-silver">
        Admin action required now — tracking stages live on the{' '}
        <Link href="/admin/vacating" className="font-medium text-white underline-offset-2 hover:underline">
          move-out pipeline
        </Link>
        .
      </p>
      <MoveOutPipelineQueue
        items={items}
        filter="all"
        opsActionOnly
        approvalPreviewByRequestId={approvalPreviewByRequestId}
      />
      <p className="text-center text-xs text-apg-silver">
        <Link href={vacatingPipelineHref()} className="underline-offset-2 hover:text-white hover:underline">
          Open full move-out pipeline
        </Link>
      </p>
    </div>
  );
}
