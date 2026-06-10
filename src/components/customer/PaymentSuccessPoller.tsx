'use client';

import { useEffect, useState } from 'react';

type Props = {
  bookingCode: string;
  maxAttempts?: number;
  intervalMs?: number;
};

/**
 * Polls until the booking flips to confirmed (webhook or checkout-verify).
 * Avoids bouncing the customer back to the pay page during async processing.
 */
export function PaymentSuccessPoller({
  bookingCode,
  maxAttempts = 15,
  intervalMs = 2000,
}: Props) {
  const [message, setMessage] = useState('Confirming your payment…');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let attempts = 0;
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      attempts += 1;
      try {
        const res = await fetch(
          `/api/payments/razorpay/status?booking_code=${encodeURIComponent(bookingCode)}`,
          { cache: 'no-store' },
        );
        const data = (await res.json()) as { confirmed?: boolean };
        if (data.confirmed) {
          setDone(true);
          window.location.reload();
          return;
        }
      } catch {
        // keep polling
      }
      if (attempts >= maxAttempts) {
        setMessage(
          'Payment received — confirmation is taking longer than usual. Refresh this page in a moment or check My bookings.',
        );
        return;
      }
      setTimeout(poll, intervalMs);
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [bookingCode, maxAttempts, intervalMs]);

  if (done) return null;

  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">{message}</p>
    </div>
  );
}
