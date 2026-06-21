'use client';

import Link from 'next/link';
import {
  ApproveVacatingButton,
  CancelVacatingNoticeButton,
  RejectVacatingButton,
  UndoVacatingApprovalButton,
  UndoVacatingCompletionButton,
} from '@/src/components/admin/VacatingActions';
import type { VacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';

export function VacatingRowActions({
  requestId,
  status,
  settlementHref,
  depositHeldPaise: _depositHeldPaise = 0,
  approvalPreview,
}: {
  requestId: string;
  status: string;
  settlementHref?: string | null;
  depositHeldPaise?: number;
  approvalPreview?: VacatingApprovalPreview;
}) {
  return (
    <div className="flex flex-col items-end gap-2">
      {status === 'pending' ? (
        <ApproveVacatingButton requestId={requestId} preview={approvalPreview} />
      ) : null}
      {status === 'approved' ? (
        settlementHref ? (
          <Link
            href={settlementHref}
            className="rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
          >
            Open checkout
          </Link>
        ) : (
          <span className="rounded border border-amber-400/30 px-2 py-1 text-[10px] text-amber-200">
            Checkout not ready yet
          </span>
        )
      ) : null}

      {status === 'pending' || status === 'approved' || status === 'completed' ? (
        <details className="text-right">
          <summary className="cursor-pointer text-[11px] text-apg-silver hover:text-white">
            More actions
          </summary>
          <div className="mt-2 flex flex-wrap justify-end gap-1">
            {status === 'pending' ? (
              <>
                <RejectVacatingButton requestId={requestId} />
                <CancelVacatingNoticeButton requestId={requestId} />
              </>
            ) : null}
            {status === 'approved' ? (
              <>
                <UndoVacatingApprovalButton requestId={requestId} />
                <CancelVacatingNoticeButton requestId={requestId} />
              </>
            ) : null}
            {status === 'completed' ? <UndoVacatingCompletionButton requestId={requestId} /> : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
