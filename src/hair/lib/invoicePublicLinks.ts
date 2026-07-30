/** Canonical public FYH host for invoice deep links (Excel, WhatsApp, etc.). */
export const FYH_PUBLIC_HOST = 'https://fyhair.awesomepg.in';

/**
 * Base URL for live FYH invoice links in exports and notifications.
 * Uses FYH_APP_URL when set, otherwise the production FYH host.
 */
export function fyhPublicBaseUrl(): string {
  const fromEnv =
    process.env.FYH_APP_URL?.replace(/\/$/, '') ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (fromEnv && (fromEnv.includes('fyhair') || fromEnv.includes('foryourhair'))) {
    return fromEnv;
  }
  if (fromEnv && process.env.NODE_ENV === 'development') {
    return fromEnv;
  }
  return FYH_PUBLIC_HOST;
}

/** Public browser URL for an invoice detail page (not /fyh internal rewrite path). */
export function invoicePublicViewUrl(invoiceId: string): string {
  return `${fyhPublicBaseUrl()}/billing/${invoiceId}`;
}

/** Authenticated print/download endpoint (HTML receipt — open from invoice page). */
export function invoicePublicPrintUrl(invoiceId: string): string {
  return `${fyhPublicBaseUrl()}/fyh/api/invoices/${invoiceId}/print?download=1`;
}
