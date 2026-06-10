import { env } from '@/src/lib/env';

export function isRazorpayConfigured(): boolean {
  return razorpayConfigError() === null;
}

export function razorpayConfigError(): string | null {
  if (!env.RAZORPAY_KEY_ID) return 'RAZORPAY_KEY_ID is not configured.';
  if (!env.RAZORPAY_KEY_SECRET) return 'RAZORPAY_KEY_SECRET is not configured.';
  if (!env.RAZORPAY_WEBHOOK_SECRET) return 'RAZORPAY_WEBHOOK_SECRET is not configured.';
  return null;
}
