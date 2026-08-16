'use client';

import { useActionState } from 'react';
import { paiseToInr } from '@/src/lib/format';
import {
  createAccountAction,
  type WealthActionState,
} from '@/src/owner/actions/wealth';

type AccountRow = {
  id: string;
  name: string;
  accountType: string;
  balancePaise: number;
};

export function AccountsUi({ accounts }: { accounts: AccountRow[] }) {
  const [state, formAction, pending] = useActionState<WealthActionState, FormData>(
    createAccountAction,
    {},
  );
  const totalBalance = accounts.reduce((s, a) => s + a.balancePaise, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Accounts</h1>
        <p className="mt-1 text-sm text-[color:var(--oo-muted)]">
          Cash and bank balances derived from the ledger — not manually overwritten.
        </p>
      </header>

      <section className="rounded-xl border border-white/10 bg-[color:var(--oo-surface)] p-4">
        <p className="text-xs uppercase tracking-wide text-[color:var(--oo-muted)]">Total balance</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
          {paiseToInr(totalBalance)}
        </p>
      </section>

      <section className="rounded-xl border border-white/10 bg-[color:var(--oo-surface)] p-4">
        <h2 className="text-sm font-medium text-white">Add account</h2>
        <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            name="name"
            placeholder="Account name"
            required
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />
          <input
            name="openingBalanceRupees"
            type="number"
            step="0.01"
            placeholder="Opening balance (₹)"
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? 'Creating…' : 'Create account'}
          </button>
        </form>
        {state.error ? <p className="mt-2 text-sm text-red-400">{state.error}</p> : null}
        {state.success ? <p className="mt-2 text-sm text-emerald-400">{state.success}</p> : null}
      </section>

      <div className="space-y-2">
        {accounts.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between rounded-lg border border-white/10 bg-[color:var(--oo-surface)] px-4 py-3"
          >
            <div>
              <p className="font-medium text-white">{a.name}</p>
              <p className="text-xs text-[color:var(--oo-muted)]">{a.accountType}</p>
            </div>
            <p className="font-semibold tabular-nums text-white">{paiseToInr(a.balancePaise)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
