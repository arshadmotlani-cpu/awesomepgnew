'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { paiseToInr } from '@/src/lib/format';
import {
  createPropertyAction,
  type WealthActionState,
} from '@/src/owner/actions/wealth';

export function PropertyFormUi() {
  const [state, formAction, pending] = useActionState<WealthActionState, FormData>(
    createPropertyAction,
    {},
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Add property</h1>
        <p className="mt-1 text-sm text-[color:var(--oo-muted)]">
          Record purchase basis and optional current estimate. Appreciation is calculated automatically.
        </p>
      </header>

      <form action={formAction} className="space-y-4 rounded-xl border border-white/10 bg-[color:var(--oo-surface)] p-4">
        <input name="name" placeholder="Property name" required className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
        <input name="address" placeholder="Address" className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
        <input name="city" placeholder="City" className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="purchaseDate" type="date" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          <input name="purchasePriceRupees" type="number" step="0.01" placeholder="Purchase price (₹)" required className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          <input name="purchaseCostsRupees" type="number" step="0.01" placeholder="Purchase costs (₹)" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          <input name="ownershipPct" type="number" step="0.01" placeholder="Ownership %" defaultValue={100} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          <input name="currentValueRupees" type="number" step="0.01" placeholder="Current estimate (₹)" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          <input name="annualAppreciationPct" type="number" step="0.01" placeholder="Expected appreciation %/year" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
        </div>
        <textarea name="notes" placeholder="Notes" rows={2} className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
        <div className="flex gap-3">
          <button type="submit" disabled={pending} className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {pending ? 'Creating…' : 'Create property'}
          </button>
          <Link href="/assets" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white">
            Cancel
          </Link>
        </div>
        {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-emerald-400">{state.success}</p> : null}
      </form>
    </div>
  );
}
