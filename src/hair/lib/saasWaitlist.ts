export type SaasWaitlistInput = {
  salonName: string;
  ownerName: string;
  email: string;
  phone: string;
  city: string;
  notes: string;
  website: string;
};

export type SaasWaitlistParseResult =
  | { ok: true; value: Omit<SaasWaitlistInput, 'website'> }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseSaasWaitlistForm(input: SaasWaitlistInput): SaasWaitlistParseResult {
  if (input.website.trim()) {
    return { ok: false, error: 'Unable to submit right now.' };
  }
  const salonName = input.salonName.trim();
  const ownerName = input.ownerName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const city = input.city.trim();
  const notes = input.notes.trim();
  if (salonName.length < 2) return { ok: false, error: 'Salon name is required.' };
  if (ownerName.length < 2) return { ok: false, error: 'Your name is required.' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Enter a valid email.' };
  if (salonName.length > 200 || ownerName.length > 200 || email.length > 320) {
    return { ok: false, error: 'One of the fields is too long.' };
  }
  return {
    ok: true,
    value: {
      salonName,
      ownerName,
      email,
      phone: phone.slice(0, 40),
      city: city.slice(0, 120),
      notes: notes.slice(0, 2000),
    },
  };
}
