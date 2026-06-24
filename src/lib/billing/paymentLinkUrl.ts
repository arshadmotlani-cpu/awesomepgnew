import { appAbsoluteUrl } from '@/src/lib/url';

/** Public URL for a generated payment link (resident-facing breakdown + QR). */
export function paymentLinkPublicUrl(linkId: string, baseUrl?: string): string {
  if (baseUrl?.trim()) {
    const origin = baseUrl.trim().replace(/\/$/, '');
    return `${origin}/pay/${linkId}`;
  }
  return appAbsoluteUrl(`/pay/${linkId}`);
}
