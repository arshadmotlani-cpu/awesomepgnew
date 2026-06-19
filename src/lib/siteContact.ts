import { whatsAppPhoneDigits } from '@/src/lib/kyc/adminWhatsApp';

/** Default owner mobile (10 digits, no country code). */
export const SITE_OWNER_PHONE_LOCAL = '9049163636';

function resolveSiteOwnerPhoneLocal(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_WHATSAPP_PHONE?.trim();
  if (!raw) return SITE_OWNER_PHONE_LOCAL;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return SITE_OWNER_PHONE_LOCAL;
}

/** wa.me / api.whatsapp.com digits — `91` + 10-digit local mobile. */
export function siteWhatsAppPhoneDigits(): string {
  const local = resolveSiteOwnerPhoneLocal();
  return whatsAppPhoneDigits(local) ?? `91${local}`;
}

/** Customer-facing WhatsApp deep link to the site owner. */
export function siteWhatsAppUrl(text?: string): string {
  const base = `https://wa.me/${siteWhatsAppPhoneDigits()}`;
  const message = text?.trim();
  if (!message) return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}
