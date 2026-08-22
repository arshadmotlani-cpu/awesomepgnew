'use server';

import { hairDb } from '@/src/hair/db/client';
import { saasWaitlistSignups } from '@/src/hair/db/schema/saasWaitlist';
import { parseSaasWaitlistForm } from '@/src/hair/lib/saasWaitlist';

export type SaasWaitlistActionState = {
  ok: boolean;
  error?: string;
};

export async function submitSaasWaitlistAction(
  _prev: SaasWaitlistActionState,
  formData: FormData,
): Promise<SaasWaitlistActionState> {
  const parsed = parseSaasWaitlistForm({
    salonName: String(formData.get('salonName') ?? ''),
    ownerName: String(formData.get('ownerName') ?? ''),
    email: String(formData.get('email') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    city: String(formData.get('city') ?? ''),
    notes: String(formData.get('notes') ?? ''),
    website: String(formData.get('website') ?? ''),
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  try {
    await hairDb.insert(saasWaitlistSignups).values({
      salonName: parsed.value.salonName,
      ownerName: parsed.value.ownerName,
      email: parsed.value.email,
      phone: parsed.value.phone || null,
      city: parsed.value.city || null,
      notes: parsed.value.notes || null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('saas_waitlist_signups_email_uidx') || msg.toLowerCase().includes('unique')) {
      return { ok: false, error: 'That email is already on the waitlist.' };
    }
    return { ok: false, error: 'Could not save your request. Try again later.' };
  }

  return { ok: true };
}
