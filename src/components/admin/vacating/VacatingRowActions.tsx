'use client';

import Link from 'next/link';
import {
  ApproveVacatingButton,
  CancelVacatingNoticeButton,
  RejectVacatingButton,
  UndoVacatingApprovalButton,
  UndoVacatingCompletionButton,
} from '@/src/components/admin/VacatingActions';
import { AdminChangeVacatingDatePanel } from '@/src/components/admin/vacating/AdminChangeVacatingDatePanel';
import type { VacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';

export function VacatingRowActions({
  requestId,
  status,
  settlementHref,
  depositHeldPaise: _depositHeldPaise = 0,
  approvalPreview,
  bookingId,
  bookingCode,
  vacatingDate,
  noticeGivenDate,
}: {
  requestId: string;
  status: string;
  settlementHref?: string | null;
  depositHeldPaise?: number;
  approvalPreview?: VacatingApprovalPreview;
  bookingId?: string;
  bookingCode?: string;
  vacatingDate?: string;
  noticeGivenDate?: string;
}) {
  return (
    <div className="flex flex-col items-end gap-2">
      {status === 'pending' ? (
        <ApproveVacatingButton
          requestId={requestId}
          preview={approvalPreview}
          bookingId={bookingId}
          bookingCode={bookingCode}
        />
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

      {status === 'approved' && bookingId && vacatingDate && noticeGivenDate ? (
        <details className="w-full max-w-lg text-right">
          <summary
            className="cursor-pointer rounded-lg border border-sky-500/40 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/10"
          >
            Change vacating date
          </summary>
          <div className="mt-2 text-left">
            <AdminChangeVacatingDatePanel
              bookingId={bookingId}
              currentVacatingDate={vacatingDate}
              noticeGivenDate={noticeGivenDate}
              vacatingStatus={status}
              theme="dark"
            />
          </div>
        </details>
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
            {status === 'pending' && bookingId && vacatingDate && noticeGivenDate ? (
              <div className="mt-2 w-full max-w-md text-left">
                <AdminChangeVacatingDatePanel
                  bookingId={bookingId}
                  currentVacatingDate={vacatingDate}
                  noticeGivenDate={noticeGivenDate}
                  vacatingStatus={status}
                  theme="dark"
                />
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
