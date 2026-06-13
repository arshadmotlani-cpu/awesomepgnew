import { publicSiteBaseUrl } from '@/src/lib/kyc/adminWhatsApp';

/** Public URL for a generated payment link (resident-facing breakdown + QR). */
export function paymentLinkPublicUrl(linkId: string, baseUrl?: string): string {
  const origin = (baseUrl ?? publicSiteBaseUrl()).replace(/\/$/, '');
  return `${origin}/pay/${linkId}`;
}
