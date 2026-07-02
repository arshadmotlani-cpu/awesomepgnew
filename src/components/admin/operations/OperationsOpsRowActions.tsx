'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  dismissOperationsQueueItemAction,
  type DismissOperationsQueueState,
} from '@/app/(admin)/admin/operations/actions';
import { OperationsPaymentWhatsAppButton } from '@/src/components/admin/operations/OperationsPaymentWhatsAppButton';
import type { UnifiedOpsItem } from '@/src/services/unifiedOperationsQueue';

const dismissInitial: DismissOperationsQueueState = { status: 'idle' };

export function OperationsOpsRowActions({
  item,
  isSuperAdmin,
  showWhatsApp = false,
}: {
  item: UnifiedOpsItem;
  isSuperAdmin: boolean;
  showWhatsApp?: boolean;
}) {
  const hasPaymentLines = Boolean(item.outstandingLines?.length);
  const [dismissState, dismissAction, dismissPending] = useActionState(
    dismissOperationsQueueItemAction,
    dismissInitial,
  );

  const canDismiss = isSuperAdmin && item.customerId && item.category;

  const openLinkLabel =
    showWhatsApp && item.queue !== 'deposit_due' ? 'Open bills' : item.openLabel;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {dismissState.status === 'error' ? (
        <p className="w-full text-xs text-rose-300">{dismissState.message}</p>
      ) : null}
      {dismissState.status === 'ok' ? (
        <p className="w-full text-xs text-emerald-300">{dismissState.message}</p>
      ) : null}
      {showWhatsApp && hasPaymentLines ? <OperationsPaymentWhatsAppButton item={item} /> : null}
      <Link
        href={item.openHref}
        className="inline-flex min-h-[36px] items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2 text-xs font-semibold text-white hover:brightness-110"
      >
        {openLinkLabel}
      </Link>
      {canDismiss ? (
        <details className="relative inline-block text-left">
          <summary className="cursor-pointer list-none rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-xs font-medium text-apg-silver transition hover:border-white/25 hover:bg-white/[0.06] hover:text-white marker:content-none [&::-webkit-details-marker]:hidden">
            More
          </summary>
          <div className="absolute right-0 z-20 mt-1 min-w-[200px] rounded-xl border border-white/10 bg-[#1A1F27] py-1 shadow-2xl">
            {item.customerId ? (
              <Link
                href={`/admin/residents/${item.customerId}`}
                className="block px-4 py-2.5 text-xs text-apg-silver hover:bg-white/5 hover:text-white"
              >
                Open resident profile
              </Link>
            ) : null}
            {item.bookingId ? (
              <Link
                href={`/admin/bookings/${item.bookingId}`}
                className="block px-4 py-2.5 text-xs text-apg-silver hover:bg-white/5 hover:text-white"
              >
                Open booking
              </Link>
            ) : null}
            {item.kycSubmissionId ? (
              <Link
                href={`/admin/residents/kyc/${item.kycSubmissionId}`}
                className="block px-4 py-2.5 text-xs text-apg-silver hover:bg-white/5 hover:text-white"
              >
                KYC workspace
              </Link>
            ) : null}
            <form action={dismissAction} className="border-t border-white/10">
              <input type="hidden" name="queueItemId" value={item.id} />
              <input type="hidden" name="category" value={item.category!} />
              <input type="hidden" name="customerId" value={item.customerId ?? ''} />
              <input type="hidden" name="bookingId" value={item.bookingId ?? ''} />
              <input type="hidden" name="vacatingRequestId" value={item.vacatingRequestId ?? ''} />
              <input type="hidden" name="residentName" value={item.residentName} />
              <button
                type="submit"
                disabled={dismissPending}
                className="block w-full px-4 py-2.5 text-left text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              >
                {dismissPending ? 'Removing…' : 'Remove from Operations'}
              </button>
            </form>
          </div>
        </details>
      ) : null}
    </div>
  );
}
