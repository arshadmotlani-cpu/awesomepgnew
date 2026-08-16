'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { paiseToInr } from '@/src/lib/format';
import {
  createLiabilityAction,
  payLiabilityAction,
  type WealthActionState,
} from '@/src/owner/actions/wealth';

const LIABILITY_TYPES = [
  'EMI',
  'INTEREST_ONLY',
  'DAILY_INTEREST',
  'MONTHLY_INTEREST',
  'FIXED_SCHEDULE',
  'CUSTOM',
] as const;

export function LiabilityFormUi() {
  const [state, formAction, pending] = useActionState<WealthActionState, FormData>(
    createLiabilityAction,
    {},
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Add liability</h1>
      </header>
      <form action={formAction} className="space-y-4 rounded-xl border border-white/10 bg-[color:var(--oo-surface)] p-4">
        <input name="name" placeholder="Loan name" required className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
        <input name="lender" placeholder="Lender" className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
        <select name="liabilityType" className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
          {LIABILITY_TYPES.map((t) => (
            <option key={t} value={t}>{t.replaceAll('_', ' ')}</option>
          ))}
        </select>
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="originalPrincipalRupees" type="number" step="0.01" placeholder="Original principal (₹)" required className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          <input name="currentPrincipalRupees" type="number" step="0.01" placeholder="Current principal (₹)" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          <input name="interestRatePct" type="number" step="0.01" placeholder="Interest rate %" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          <input name="tenureMonths" type="number" placeholder="Tenure (months)" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          <input name="startDate" type="date" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          <input name="fixedPaymentRupees" type="number" step="0.01" placeholder="Fixed payment (₹)" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
        </div>
        <div className="flex gap-3">
          <button type="submit" disabled={pending} className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-medium text-white">
            Create loan
          </button>
          <Link href="/liabilities" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white">Cancel</Link>
        </div>
        {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-emerald-400">{state.success}</p> : null}
      </form>
    </div>
  );
}

type AccountOption = { id: string; name: string };

export function LiabilityDetailUi({
  liability,
  due,
  accounts,
}: {
  liability: {
    id: string;
    name: string;
    lender: string | null;
    liabilityType: string;
    currentPrincipalPaise: number;
    interestRateBps: number;
  };
  due: {
    principalDuePaise: number;
    interestDuePaise: number;
    totalDuePaise: number;
    dueDate: string | null;
  } | null;
  accounts: AccountOption[];
}) {
  const [state, formAction, pending] = useActionState<WealthActionState, FormData>(
    payLiabilityAction,
    {},
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">{liability.name}</h1>
        <p className="mt-1 text-sm text-[color:var(--oo-muted)]">
          {liability.lender ?? liability.liabilityType.replaceAll('_', ' ')} ·{' '}
          {(liability.interestRateBps / 100).toFixed(2)}% interest
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-[color:var(--oo-surface)] p-4">
          <p className="text-xs text-[color:var(--oo-muted)]">Outstanding principal</p>
          <p className="text-xl font-semibold tabular-nums text-white">
            {paiseToInr(liability.currentPrincipalPaise)}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[color:var(--oo-surface)] p-4">
          <p className="text-xs text-[color:var(--oo-muted)]">Interest due</p>
          <p className="text-xl font-semibold tabular-nums text-white">
            {paiseToInr(due?.interestDuePaise ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[color:var(--oo-surface)] p-4">
          <p className="text-xs text-[color:var(--oo-muted)]">Total due</p>
          <p className="text-xl font-semibold tabular-nums text-white">
            {paiseToInr(due?.totalDuePaise ?? 0)}
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-white/10 bg-[color:var(--oo-surface)] p-4">
        <h2 className="text-sm font-medium text-white">Record payment</h2>
        <p className="mt-1 text-xs text-[color:var(--oo-muted)]">
          Interest posts as expense; principal reduces liability. Net worth impact is correct.
        </p>
        <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="liabilityId" value={liability.id} />
          <input name="amountRupees" type="number" step="0.01" placeholder="Payment amount (₹)" required className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          <input name="paymentDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          <select name="accountId" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
            <option value="">Payment account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select name="allocationMode" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
            <option value="AUTO">Auto allocate</option>
            <option value="MANUAL">Manual split</option>
          </select>
          <input name="manualInterestRupees" type="number" step="0.01" placeholder="Manual interest (₹)" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          <input name="manualPrincipalRupees" type="number" step="0.01" placeholder="Manual principal (₹)" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          <button type="submit" disabled={pending} className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-medium text-white">
            Record payment
          </button>
        </form>
        {state.error ? <p className="mt-2 text-sm text-red-400">{state.error}</p> : null}
        {state.success ? <p className="mt-2 text-sm text-emerald-400">{state.success}</p> : null}
      </section>
    </div>
  );
}
