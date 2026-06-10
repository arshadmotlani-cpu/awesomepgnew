import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Razorpay Checkout signature (returned in the payment handler callback).
 *   HMAC_SHA256(key_secret, order_id + "|" + payment_id)
 * @see https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/#step-4-verify-payment-signature
 */
export function razorpayCheckoutSign(
  orderId: string,
  paymentId: string,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

export function razorpayCheckoutVerify(input: {
  orderId: string;
  paymentId: string;
  signature: string;
  secret: string;
}): boolean {
  const expected = razorpayCheckoutSign(input.orderId, input.paymentId, input.secret);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(input.signature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
