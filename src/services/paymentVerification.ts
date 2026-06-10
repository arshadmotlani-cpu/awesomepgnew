import { env } from '@/src/lib/env';
import { razorpayConfigError } from '@/src/lib/payments/config';
import { razorpayCheckoutVerify } from '@/src/lib/payments/razorpayCheckout';
import {
  recordExtensionPaymentSuccess,
  recordPaymentSuccess,
} from '@/src/services/bookingLifecycle';
import {
  recordElectricityPaymentSuccess,
} from '@/src/services/electricityBilling';
import { recordRentPaymentSuccess } from '@/src/services/rentInvoices';

export type VerifyCheckoutPurpose =
  | { purpose: 'booking'; bookingCode: string }
  | { purpose: 'extension'; extensionId: string }
  | { purpose: 'rent'; rentInvoiceId: string }
  | { purpose: 'electricity'; electricityInvoiceId: string };

export type VerifyCheckoutInput = {
  razorpayPaymentId: string;
  razorpayOrderId: string;
  razorpaySignature: string;
  amountPaise: number;
} & VerifyCheckoutPurpose;

export type VerifyCheckoutResult =
  | {
      ok: true;
      paymentId: string;
      stateChanged: boolean;
      redirectPath: string;
    }
  | { ok: false; reason: string };

function assertRazorpayConfigured(): string | null {
  return razorpayConfigError();
}

/**
 * Verifies a Razorpay Checkout callback signature and records the payment
 * through the same idempotent lifecycle handlers used by webhooks.
 */
export async function verifyRazorpayCheckoutPayment(
  input: VerifyCheckoutInput,
): Promise<VerifyCheckoutResult> {
  const configErr = assertRazorpayConfigured();
  if (configErr) return { ok: false, reason: configErr };

  const secret = env.RAZORPAY_KEY_SECRET!;
  if (
    !razorpayCheckoutVerify({
      orderId: input.razorpayOrderId,
      paymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature,
      secret,
    })
  ) {
    return { ok: false, reason: 'Invalid payment signature.' };
  }

  const rawPayload = {
    source: 'checkout_verify',
    razorpay_payment_id: input.razorpayPaymentId,
    razorpay_order_id: input.razorpayOrderId,
    amount_paise: input.amountPaise,
    purpose: input.purpose,
  };

  if (input.purpose === 'booking') {
    const result = await recordPaymentSuccess({
      provider: 'razorpay',
      providerPaymentId: input.razorpayPaymentId,
      providerOrderId: input.razorpayOrderId,
      amountPaise: input.amountPaise,
      bookingCode: input.bookingCode,
      rawPayload,
    });
    if (!result.ok) return { ok: false, reason: result.reason };
    return {
      ok: true,
      paymentId: result.paymentId,
      stateChanged: result.stateChanged,
      redirectPath: `/booking/${input.bookingCode}/payment-success?payment=${result.paymentId}`,
    };
  }

  if (input.purpose === 'extension') {
    const result = await recordExtensionPaymentSuccess({
      provider: 'razorpay',
      providerPaymentId: input.razorpayPaymentId,
      providerOrderId: input.razorpayOrderId,
      amountPaise: input.amountPaise,
      extensionId: input.extensionId,
      rawPayload,
    });
    if (!result.ok) return { ok: false, reason: result.reason };
    return {
      ok: true,
      paymentId: result.paymentId,
      stateChanged: result.stateChanged,
      redirectPath: `/booking/${result.bookingCode}?payment=${result.paymentId}`,
    };
  }

  if (input.purpose === 'rent') {
    const result = await recordRentPaymentSuccess({
      provider: 'razorpay',
      providerPaymentId: input.razorpayPaymentId,
      providerOrderId: input.razorpayOrderId,
      amountPaise: input.amountPaise,
      invoiceId: input.rentInvoiceId,
      rawPayload,
    });
    if (!result.ok) return { ok: false, reason: result.reason };
    return {
      ok: true,
      paymentId: result.paymentId,
      stateChanged: result.stateChanged,
      redirectPath: `/account/payments/${result.paymentId}/receipt`,
    };
  }

  const result = await recordElectricityPaymentSuccess({
    provider: 'razorpay',
    providerPaymentId: input.razorpayPaymentId,
    providerOrderId: input.razorpayOrderId,
    amountPaise: input.amountPaise,
    invoiceId: input.electricityInvoiceId,
    rawPayload,
  });
  if (!result.ok) return { ok: false, reason: result.reason };
  return {
    ok: true,
    paymentId: result.paymentId,
    stateChanged: result.stateChanged,
    redirectPath: `/account/payments/${result.paymentId}/receipt`,
  };
}
