export type RazorpayHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export type VerifyCheckoutBody = {
  purpose: 'booking' | 'extension' | 'rent' | 'electricity';
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
  amount_paise: number;
  booking_code?: string;
  extension_id?: string;
  rent_invoice_id?: string;
  electricity_invoice_id?: string;
};

export type VerifyCheckoutResponse =
  | {
      ok: true;
      paymentId: string;
      stateChanged: boolean;
      redirectPath: string;
    }
  | { ok: false; reason: string };

export async function verifyRazorpayCheckoutOnServer(
  body: VerifyCheckoutBody,
): Promise<VerifyCheckoutResponse> {
  const res = await fetch('/api/payments/razorpay/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = (await res.json()) as VerifyCheckoutResponse;
  return data;
}

export function loadRazorpaySdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Razorpay SDK is client-only.'));
      return;
    }
    const w = window as unknown as { Razorpay?: unknown };
    if (w.Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout SDK.'));
    document.body.appendChild(script);
  });
}
