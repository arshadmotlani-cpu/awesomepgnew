import type { TrafficSource } from './constants';

export function classifyTrafficSource(
  referrer: string | null | undefined,
  utmSource: string | null | undefined,
): TrafficSource {
  const utm = (utmSource ?? '').toLowerCase();
  if (utm.includes('google')) return 'google';
  if (utm.includes('instagram') || utm === 'ig') return 'instagram';
  if (utm.includes('facebook') || utm === 'fb') return 'facebook';
  if (utm.includes('whatsapp') || utm === 'wa') return 'whatsapp';

  if (!referrer) return 'direct';

  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (host.includes('google.')) return 'google';
    if (host.includes('instagram.') || host.includes('l.instagram.')) return 'instagram';
    if (host.includes('facebook.') || host.includes('fb.') || host === 'fb.com') return 'facebook';
    if (host.includes('whatsapp.') || host.includes('wa.me')) return 'whatsapp';
  } catch {
    // Malformed referrer — treat as other.
  }

  return 'other';
}
