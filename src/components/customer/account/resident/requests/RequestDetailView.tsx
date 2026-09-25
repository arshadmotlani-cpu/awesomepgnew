'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusChip, StatusTimeline } from '@/src/components/customer/design-system';
import { ApgCard } from '@/src/components/customer/design-system';
import { ResidentMoreSection } from '@/src/components/customer/account/resident/ResidentMoreSection';
import { siteWhatsAppUrl } from '@/src/lib/siteContact';
import { formatDate } from '@/src/lib/format';
import { cancelRoomChangeAction } from '@/app/(customer)/account/resident/room-change-actions';
import {
  nextStepForRequest,
  REQUEST_TIMELINE_STAGES,
  requestStatusToTimelineIndex,
  requestTypeLabel,
  VACATING_TIMELINE_STAGES,
  type ActiveRequestItem,
} from '@/src/lib/residents/requestCenter';
import { residentTabHref } from '@/src/lib/accountNavigation';

export function RequestDetailView({
  request,
  onBack,
}: {
  request: ActiveRequestItem;
  onBack: () => void;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const isRejected = request.status === 'rejected';
  const isRoomChange = request.type === 'room_change';
  const stages = request.isVacating ? VACATING_TIMELINE_STAGES : REQUEST_TIMELINE_STAGES;
  const activeIndex = requestStatusToTimelineIndex(request.status);

  async function cancelRoomChange() {
    const requestId = request.roomChangeRequestId ?? request.id;
    setCancelError(null);
    setCancelPending(true);
    try {
      const result = await cancelRoomChangeAction({ requestId });
      if (!result.ok) {
        setCancelError(result.message);
        return;
      }
      router.refresh();
      onBack();
    } finally {
      setCancelPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-zinc-600 hover:text-zinc-900">
        ← Back to requests
      </button>

      <ApgCard tier="account" className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={request.status} />
          <h2 className="text-lg font-semibold text-zinc-900">{request.typeLabel}</h2>
        </div>
        <p className="mt-1 font-mono text-xs text-zinc-500">
          Ref {request.id.replace(/^vacating-/, '').slice(0, 8)}… · Started{' '}
          {formatDate(request.createdAt)}
        </p>

        <section className="mt-5">
          <h3 className="text-sm font-semibold text-zinc-900">Progress</h3>
          <div className="mt-4">
            <StatusTimeline stages={stages} activeIndex={activeIndex} orientation="vertical" />
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <h3 className="text-sm font-semibold text-zinc-900">What happens next</h3>
          <p className="mt-1 text-sm text-zinc-600">
            {isRejected
              ? 'This request was declined. Contact the office if you need help.'
              : nextStepForRequest(request.status, request.type)}
          </p>
          {request.adminNotes ? (
            <p className="mt-2 text-xs text-zinc-500">Last update: {request.adminNotes}</p>
          ) : null}
        </section>

        {isRoomChange ? (
          <section className="mt-5 space-y-2 rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
            <p>
              <span className="font-medium text-zinc-900">Requested bed:</span>{' '}
              {request.toBedLabel ?? '—'}
            </p>
            {request.expectedTransferDate ? (
              <p>
                <span className="font-medium text-zinc-900">Earliest transfer:</span>{' '}
                {formatDate(request.expectedTransferDate)}
              </p>
            ) : null}
            {request.transferMode === 'scheduled' ? (
              <p className="text-xs text-zinc-500">
                You stay on your current bed until the destination is free. The ₹90 shift fee stays
                on your account while this request is open.
              </p>
            ) : null}
            {request.canCancel ? (
              <button
                type="button"
                disabled={cancelPending}
                onClick={() => void cancelRoomChange()}
                className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60"
              >
                {cancelPending ? 'Cancelling…' : 'Cancel bed transfer request'}
              </button>
            ) : null}
            {cancelError ? <p className="text-xs text-red-600">{cancelError}</p> : null}
          </section>
        ) : null}

        <ResidentMoreSection title="Add a message" description="Send an update to the office on WhatsApp.">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            placeholder="Optional note for the office…"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <a
            href={siteWhatsAppUrl(
              `Hi, regarding my ${request.typeLabel.toLowerCase()} (ref ${request.id.slice(0, 8)}): ${message || 'I have a question.'}`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex text-sm font-semibold text-emerald-700 hover:underline"
          >
            Send on WhatsApp →
          </a>
        </ResidentMoreSection>
      </ApgCard>
    </div>
  );
}
