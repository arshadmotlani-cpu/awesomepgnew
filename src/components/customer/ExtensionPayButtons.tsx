'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import {
  cancelPendingExtensionAction,
  startRazorpayExtensionOrder,
  type CancelExtensionActionState,
  type ExtensionPayActionState,
} from '@/app/(customer)/booking/[bookingCode]/extend/[extensionId]/pay/actions';
import {
  loadRazorpaySdk,
  verifyRazorpayCheckoutOnServer,
} from '@/src/lib/payments/razorpayClient';

const idlePay: ExtensionPayActionState = { status: 'idle' };
const idleCancel: CancelExtensionActionState = { status: 'idle' };

export function RazorpayExtensionCheckoutButton({
  extensionId,
  totalLabel,
}: {
  extensionId: string;
  totalLabel: string;
}) {
  const [state, formAction, pending] = useActionState(
    startRazorpayExtensionOrder,
    idlePay,
  );
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const sdkRef = useRef(false);

  useEffect(() => {
    if (sdkRef.current) return;
    sdkRef.current = true;
    void loadRazorpaySdk();
  }, []);

  useEffect(() => {
    if (state.status !== 'razorpay_ready') return;
    const w = window as unknown as {
      Razorpay?: new (opts: Record<string, unknown>) => { open: () => void };
    };
    if (!w.Razorpay) return;

    const rzp = new w.Razorpay({
      key: state.keyId,
      amount: state.amountPaise,
      currency: 'INR',
      name: 'Awesome PG',
      description: `Extension for ${state.bookingCode}`,
      order_id: state.providerOrderId,
      prefill: {
        name: state.customerName,
        email: state.customerEmail,
        contact: state.customerPhone,
      },
      notes: {
        booking_code: state.bookingCode,
        kind: 'extension',
        extension_id: state.extensionId,
      },
      handler: async (response: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) => {
        setVerifyError(null);
        setVerifying(true);
        const verified = await verifyRazorpayCheckoutOnServer({
          purpose: 'extension',
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature,
          amount_paise: state.amountPaise,
          extension_id: state.extensionId,
        });
        setVerifying(false);
        if (!verified.ok) {
          setVerifyError(verified.reason);
          return;
        }
        window.location.assign(verified.redirectPath);
      },
      modal: {
        ondismiss: () => setVerifying(false),
      },
    });
    rzp.open();
  }, [state]);

  const busy = pending || verifying;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="extensionId" value={extensionId} />
      <button
        type="submit"
        disabled={busy}
        className="inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
      >
        {verifying
          ? 'Confirming payment…'
          : pending
            ? 'Opening secure checkout…'
            : `Pay ${totalLabel}`}
      </button>
      {state.status === 'error' ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {state.message}
        </p>
      ) : null}
      {verifyError ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {verifyError}
        </p>
      ) : null}
    </form>
  );
}

/** @deprecated Mock checkout removed — use RazorpayExtensionCheckoutButton. */
export function MockExtensionPayButton({
  extensionId,
  totalLabel,
}: {
  extensionId: string;
  amountPaise: number;
  totalLabel: string;
}) {
  return <RazorpayExtensionCheckoutButton extensionId={extensionId} totalLabel={totalLabel} />;
}

export function CancelPendingExtensionForm({
  extensionId,
}: {
  extensionId: string;
}) {
  const [state, formAction, pending] = useActionState(
    cancelPendingExtensionAction,
    idleCancel,
  );
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="extensionId" value={extensionId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-md border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Cancelling…' : 'Cancel this extension'}
      </button>
      {state.status === 'error' ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
