import { findCustomerByPhone } from '@/src/lib/auth/customer';
import { normaliseIndianPhone } from '@/src/lib/phone';

/** Synthetic inbox for phone-first booking signup — no schema change. */
export function bookingEmailFromPhone(rawPhone: string): string | null {
  const phone = normaliseIndianPhone(rawPhone);
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return `book+${digits}@awesomepg.app`;
}

export async function resolveBookingOtpEmail(rawPhone: string): Promise<{
  email: string;
  existingAccount: boolean;
  maskedEmail?: string;
}> {
  const phone = normaliseIndianPhone(rawPhone);
  if (!phone) {
    throw new Error('Enter a valid 10-digit mobile number.');
  }

  const existing = await findCustomerByPhone(phone);
  if (existing && !existing.archivedAt) {
    const [local, domain] = existing.email.split('@');
    const masked =
      local.length <= 2
        ? `${local[0] ?? '*'}***@${domain}`
        : `${local.slice(0, 2)}***@${domain}`;
    return { email: existing.email, existingAccount: true, maskedEmail: masked };
  }

  const email = bookingEmailFromPhone(phone);
  if (!email) throw new Error('Enter a valid 10-digit mobile number.');
  return { email, existingAccount: false };
}
