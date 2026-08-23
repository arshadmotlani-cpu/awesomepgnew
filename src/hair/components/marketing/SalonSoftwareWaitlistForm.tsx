'use client';

import { useActionState } from 'react';
import { submitSaasWaitlistAction, type SaasWaitlistActionState } from '@/src/hair/actions/saasWaitlist';

const initial: SaasWaitlistActionState = { ok: false };

export function SalonSoftwareWaitlistForm({ variant = 'default' }: { variant?: 'default' | 'sales' } = {}) {
  const [state, formAction, pending] = useActionState(submitSaasWaitlistAction, initial);

  if (state.ok) {
    return (
      <p className="rounded-lg border border-[color:var(--fyh-border-token)] bg-[color:var(--fyh-surface)] p-4 text-sm text-[color:var(--fyh-text-secondary-token)]">
        You're in. We'll email you when your early access is ready.
      </p>
    );
  }

  return (
    <form action={formAction} className="grid gap-3">
      <label className="grid gap-1 text-sm">
        <span>Salon name</span>
        <input required name="salonName" className="fyh-input" autoComplete="organization" />
      </label>
      <label className="grid gap-1 text-sm">
        <span>Your name</span>
        <input required name="ownerName" className="fyh-input" autoComplete="name" />
      </label>
      <label className="grid gap-1 text-sm">
        <span>Email</span>
        <input required type="email" name="email" className="fyh-input" autoComplete="email" />
      </label>
      <label className="grid gap-1 text-sm">
        <span>Phone (optional)</span>
        <input name="phone" className="fyh-input" autoComplete="tel" />
      </label>
      <label className="grid gap-1 text-sm">
        <span>City (optional)</span>
        <input name="city" className="fyh-input" autoComplete="address-level2" />
      </label>
      <label className="grid gap-1 text-sm">
        <span>Anything we should know (optional)</span>
        <textarea name="notes" rows={3} className="fyh-input" />
      </label>
      <div className="hidden" aria-hidden="true">
        <input name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {state.error ? <p className="text-sm text-[color:var(--fyh-danger)]">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="fyh-btn-primary justify-self-start px-4 py-2 text-sm">
        {pending ? 'Sending…' : variant === 'sales' ? 'Get early access' : 'Join the waitlist'}
      </button>
    </form>
  );
}
