'use client';

import { useActionState } from 'react';
import {
  cancelPendingExtensionAction,
  type CancelExtensionActionState,
} from '@/app/(customer)/booking/[bookingCode]/extend/[extensionId]/pay/actions';
import { QrPaymentNotice } from './QrPaymentNotice';

const idleCancel: CancelExtensionActionState = { status: 'idle' };

export function RazorpayExtensionCheckoutButton({
  totalLabel,
}: {
  extensionId: string;
  totalLabel: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600">
        Extension total: <span className="font-semibold">{totalLabel}</span>
      </p>
      <QrPaymentNotice
        title="Pay extension via QR"
        description="Open your PG on /pgs, use Payments, and submit proof after paying via UPI QR."
      />
    </div>
  );
}

export function CancelPendingExtensionForm({ extensionId }: { extensionId: string }) {
  const [state, formAction, pending] = useActionState(cancelPendingExtensionAction, idleCancel);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="extensionId" value={extensionId} />
      <button
        type="submit"
        disabled={pending}
        className="text-sm text-zinc-500 underline hover:text-zinc-700 disabled:opacity-50"
      >
        {pending ? 'Cancelling…' : 'Cancel extension request'}
      </button>
      {state.status === 'error' ? (
        <p className="text-sm text-rose-600">{state.message}</p>
      ) : null}
    </form>
  );
}
