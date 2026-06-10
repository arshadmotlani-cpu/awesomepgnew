'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import {
  startRazorpayRentOrder,
  startRazorpayElectricityOrder,
  type ActionState,
} from '@/app/(customer)/account/resident/actions';
import {
  loadRazorpaySdk,
  verifyRazorpayCheckoutOnServer,
} from '@/src/lib/payments/razorpayClient';

const idleState: ActionState = { status: 'idle' };

export function ResidentPayButtons({
  invoiceId,
  purpose,
  totalLabel,
}: {
  invoiceId: string;
  purpose: 'rent' | 'electricity';
  totalLabel: string;
  amountPaise?: number;
  provider?: 'mock' | 'razorpay';
}) {
  const razorpayAction =
    purpose === 'rent' ? startRazorpayRentOrder : startRazorpayElectricityOrder;

  const [state, formAction, pending] = useActionState(razorpayAction, idleState);
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
      description: purpose === 'rent' ? 'Monthly rent' : 'Electricity bill',
      order_id: state.providerOrderId,
      prefill: {
        name: state.customerName,
        email: state.customerEmail,
        contact: state.customerPhone,
      },
      notes:
        purpose === 'rent'
          ? { kind: 'rent', rent_invoice_id: state.invoiceId, booking_code: state.bookingCode }
          : {
              kind: 'electricity',
              electricity_invoice_id: state.invoiceId,
              booking_code: state.bookingCode,
            },
      handler: async (response: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) => {
        setVerifyError(null);
        setVerifying(true);
        const verified = await verifyRazorpayCheckoutOnServer({
          purpose,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature,
          amount_paise: state.amountPaise,
          ...(purpose === 'rent'
            ? { rent_invoice_id: state.invoiceId }
            : { electricity_invoice_id: state.invoiceId }),
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
  }, [state, purpose]);

  const busy = pending || verifying;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <button
        type="submit"
        disabled={busy}
        className="inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
      >
        {verifying
          ? 'Confirming payment…'
          : pending
            ? 'Opening secure checkout…'
            : `Pay ${totalLabel}`}
      </button>
      {state.status === 'error' ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.message}
        </p>
      ) : null}
      {verifyError ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {verifyError}
        </p>
      ) : null}
    </form>
  );
}
