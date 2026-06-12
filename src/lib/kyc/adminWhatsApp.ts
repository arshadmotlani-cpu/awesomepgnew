import { accountProfileHref } from '@/src/lib/accountNavigation';
import { getWatchdogBaseUrl } from '@/src/lib/deploy/config';
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
  return (
    `Hi ${firstName}, please complete your KYC for Awesome PG so we can verify your identity.\n\n` +
    `Upload your Aadhaar (front & back) and a selfie here:\n${input.kycUrl}\n\n` +
    `Thank you!`
  );
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
  return getWatchdogBaseUrl();
}

export function needsKycReminder(status: 'pending' | 'approved' | 'rejected'): boolean {
  return status === 'pending' || status === 'rejected';
}

export function assignedResidentsNeedingKyc<
  T extends {
    tenancyStatus: 'active' | 'unassigned';
    kycStatus: 'pending' | 'approved' | 'rejected';
    phone: string;
  },
>(residents: T[]): T[] {
  return residents.filter(
    (r) =>
      r.tenancyStatus === 'active' &&
      needsKycReminder(r.kycStatus) &&
      Boolean(whatsAppPhoneDigits(r.phone)),
  );
}

export function openWhatsAppUrl(url: string): void {
  if (typeof window === 'undefined') return;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
