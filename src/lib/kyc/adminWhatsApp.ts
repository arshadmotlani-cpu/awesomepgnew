import { accountProfileHref } from '@/src/lib/accountNavigation';
import { clientAppBaseUrl, getAppUrl } from '@/src/lib/url';
import { normaliseIndianPhone } from '@/src/lib/phone';

export type KycWhatsAppPromptInput = {
  customerName: string;
  phone: string;
  /** Absolute site origin, e.g. https://awesomepg.in */
  baseUrl: string;
};

export function customerKycUploadPath(): string {
  return accountProfileHref('identity');
}

export function customerKycUploadUrl(baseUrl: string): string {
  const origin = baseUrl.replace(/\/$/, '');
  return `${origin}${customerKycUploadPath()}`;
}

export function whatsAppPhoneDigits(phone: string): string | null {
  const e164 = normaliseIndianPhone(phone);
  if (!e164) return null;
  return e164.slice(1);
}

export function buildKycWhatsAppMessage(input: {
  customerName: string;
  kycUrl: string;
}): string {
  const firstName = input.customerName.trim().split(/\s+/)[0] || 'there';
  return `Hi ${firstName}, please complete your KYC using this link: ${input.kycUrl}`;
}

export function buildKycWhatsAppUrl(input: KycWhatsAppPromptInput): string | null {
  const digits = whatsAppPhoneDigits(input.phone);
  if (!digits) return null;
  const kycUrl = customerKycUploadUrl(input.baseUrl);
  const text = buildKycWhatsAppMessage({
    customerName: input.customerName,
    kycUrl,
  });
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Server-side default public origin for admin pages. */
export function publicSiteBaseUrl(): string {
  return getAppUrl();
}

/** Public site origin for client share links (WhatsApp, referrals). */
export function clientPublicSiteBaseUrl(): string {
  return clientAppBaseUrl();
}

export function needsKycReminder(status: 'pending' | 'approved' | 'rejected'): boolean {
  return status === 'pending' || status === 'rejected';
}

export function assignedResidentsNeedingKyc<
  T extends {
    tenancyStatus: 'active' | 'unassigned' | 'vacating' | 'vacated' | 'blocked';
    kycStatus: 'pending' | 'approved' | 'rejected';
    phone: string;
  },
>(residents: T[]): T[] {
  return residents.filter(
    (r) =>
      (r.tenancyStatus === 'active' || r.tenancyStatus === 'vacating') &&
      needsKycReminder(r.kycStatus) &&
      Boolean(whatsAppPhoneDigits(r.phone)),
  );
}

export function openWhatsAppUrl(url: string): void {
  if (typeof window === 'undefined') return;
  // Direct navigation survives mobile popup blockers better than synthetic clicks.
  window.location.assign(url);
}
