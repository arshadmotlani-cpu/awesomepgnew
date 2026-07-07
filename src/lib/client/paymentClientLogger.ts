import { logResidentClientError } from '@/src/lib/client/residentClientLogger';

type PaymentLogContext = {
  page: string;
  invoiceId?: string | null;
  bookingId?: string | null;
  bookingCode?: string | null;
  residentId?: string | null;
  paymentLinkId?: string | null;
  membershipId?: string | null;
  extensionId?: string | null;
};

function browserFromUserAgent(ua: string): string {
  if (/CriOS/i.test(ua)) return 'Chrome iOS';
  if (/FxiOS/i.test(ua)) return 'Firefox iOS';
  if (/EdgiOS|Edg\//i.test(ua)) return 'Edge';
  if (/Safari/i.test(ua) && !/Chrome|CriOS|Edg\//i.test(ua)) return 'Safari';
  if (/Firefox|FxiOS/i.test(ua)) return 'Firefox';
  if (/Chrome|CriOS/i.test(ua)) return 'Chrome';
  return 'Unknown';
}

function deviceFromUserAgent(ua: string): string {
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Mobile/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

export function logPaymentClientException(
  message: string,
  error: unknown,
  context: PaymentLogContext,
): void {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const route = typeof window !== 'undefined' ? window.location.pathname : undefined;
  const query = typeof window !== 'undefined' ? window.location.search : undefined;

  logResidentClientError(message, error, {
    page: context.page,
    customerId: context.residentId ?? null,
    bookingId: context.bookingId ?? null,
    extra: {
      invoiceId: context.invoiceId ?? null,
      bookingCode: context.bookingCode ?? null,
      paymentLinkId: context.paymentLinkId ?? null,
      membershipId: context.membershipId ?? null,
      extensionId: context.extensionId ?? null,
      browser: browserFromUserAgent(ua),
      device: deviceFromUserAgent(ua),
      route,
      query,
    },
  });
}
