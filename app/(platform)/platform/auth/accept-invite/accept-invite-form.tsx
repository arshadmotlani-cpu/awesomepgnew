'use client';

import { useActionState } from 'react';
import { acceptInviteAction, type AcceptInviteState } from '@/src/platform/actions/admin';

const initialState: AcceptInviteState = {};

export function AcceptInviteForm({
  token,
  email,
  organizationName,
  accessRole,
}: {
  token: string;
  email: string;
  organizationName: string | null;
  accessRole: string;
}) {
  const [state, formAction, pending] = useActionState(acceptInviteAction, initialState);

  return (
    <>
      <p className="mt-2 text-sm text-[var(--plt-text-muted)]">
        Invitation for {email} to join {organizationName ?? 'the organization'} as {accessRole}.
      </p>
      <form action={formAction} className="mt-6 grid gap-4">
        <input type="hidden" name="token" value={token} />
        <label className="grid gap-2 text-sm">
          <span className="text-[var(--plt-text-muted)]">Full name</span>
          <input name="fullName" required className="plt-input" />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="text-[var(--plt-text-muted)]">Mobile</span>
          <input name="mobile" className="plt-input" />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="text-[var(--plt-text-muted)]">Password</span>
          <input
            name="password"
            type="password"
            minLength={8}
            required
            className="plt-input"
          />
        </label>
        {state.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="plt-btn-primary w-fit"
        >
          {pending ? 'Accepting…' : 'Accept invitation'}
        </button>
      </form>
    </>
  );
}
