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
      <p className="mt-2 text-sm text-slate-400">
        Invitation for {email} to join {organizationName ?? 'the organization'} as {accessRole}.
      </p>
      <form action={formAction} className="mt-6 grid gap-4">
        <input type="hidden" name="token" value={token} />
        <label className="grid gap-2 text-sm">
          <span>Full name</span>
          <input name="fullName" required className="rounded-lg bg-slate-950 px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm">
          <span>Mobile</span>
          <input name="mobile" className="rounded-lg bg-slate-950 px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm">
          <span>Password</span>
          <input
            name="password"
            type="password"
            minLength={8}
            required
            className="rounded-lg bg-slate-950 px-3 py-2"
          />
        </label>
        {state.error ? (
          <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {pending ? 'Accepting…' : 'Accept invitation'}
        </button>
      </form>
    </>
  );
}
