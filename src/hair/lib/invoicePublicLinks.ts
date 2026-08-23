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

/**
 * Public customer invoice page — opaque token only (Phase C).
 * Knowing/guessing an invoice number is never enough.
 */
export function invoicePublicViewUrl(publicAccessToken: string): string {
  return `${fyhPublicBaseUrl()}/i/${encodeURIComponent(publicAccessToken)}`;
}

/** Public print/download endpoint (HTML receipt) — opaque token only. */
export function invoicePublicPrintUrl(publicAccessToken: string): string {
  return `${fyhPublicBaseUrl()}/fyh/api/invoices/public/${encodeURIComponent(publicAccessToken)}/print?download=1`;
}
