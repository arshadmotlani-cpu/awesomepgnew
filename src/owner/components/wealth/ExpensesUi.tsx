'use client';

import { useActionState } from 'react';
import { paiseToInr } from '@/src/lib/format';
import {
  createExpenseAction,
  type WealthActionState,
} from '@/src/owner/actions/wealth';
import { SourceBadge } from '@/src/owner/components/wealth/SourceBadge';

const CATEGORIES = [
  'PERSONAL',
  'PROPERTY',
  'BUSINESS',
  'INVESTMENT',
  'LOAN_INTEREST',
  'TAXES',
  'REPAIRS',
  'MAINTENANCE',
  'OTHER',
] as const;

type ExpenseRow = {
  id: string;
  entryDate: string;
  description: string;
  sourceSystem: string;
  amountPaise: number;
  category: string | null;
  notes: string | null;
};

type AccountOption = { id: string; name: string };
type AssetOption = { id: string; name: string };

export function ExpensesUi({
  expenses,
  accounts,
  assets,
  expensesBySource,
}: {
  expenses: ExpenseRow[];
  accounts: AccountOption[];
  assets: AssetOption[];
  expensesBySource: Array<{ sourceSystem: string; totalPaise: number }>;
}) {
  const [state, formAction, pending] = useActionState<WealthActionState, FormData>(
    createExpenseAction,
    {},
  );
  const totalConsolidated = expensesBySource.reduce((s, r) => s + r.totalPaise, 0);

  return (
    <div className="oo-page-stack">
      <header>
        <h1 className="oo-page-title">Expenses</h1>
        <p className="oo-page-subtitle">
          Consolidated across Owner OS and connected engines. Principal repayments are not expenses.
        </p>
      </header>

      <section className="oo-card oo-card-compact">
        <h2 className="text-sm font-medium text-white">This month — by source</h2>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
          {paiseToInr(totalConsolidated)}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {expensesBySource.map((row) => (
            <div
              key={row.sourceSystem}
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"
            >
              <SourceBadge source={row.sourceSystem} />
              <p className="mt-1 text-sm font-medium tabular-nums text-white">
                {paiseToInr(row.totalPaise)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="oo-form-section">
        <h2 className="oo-form-section-title">Add manual expense</h2>
        <form action={formAction} className="oo-form-grid">
          <input
            name="description"
            placeholder="Description"
            required
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />
          <input
            name="amountRupees"
            type="number"
            step="0.01"
            placeholder="Amount (₹)"
            required
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />
          <input
            name="expenseDate"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />
          <select
            name="category"
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.replaceAll('_', ' ')}</option>
            ))}
          </select>
          <select
            name="accountId"
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          >
            <option value="">Payment account (optional)</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <input
            name="notes"
            placeholder="Notes"
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />
          <select name="assetId" className="oo-form-input">
            <option value="">Link to property (optional)</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending}
            className="oo-btn-primary disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Record expense'}
          </button>
        </form>
        {state.error ? <p className="mt-2 text-sm text-red-400">{state.error}</p> : null}
        {state.success ? <p className="mt-2 text-sm text-emerald-400">{state.success}</p> : null}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-[color:var(--oo-muted)]">Recent expenses</h2>
        <div className="space-y-2">
          {expenses.length === 0 ? (
            <p className="text-sm text-[color:var(--oo-muted)]">No expenses recorded yet.</p>
          ) : (
            expenses.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[color:var(--oo-surface)] px-4 py-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white">{e.description}</p>
                    <SourceBadge source={e.sourceSystem} />
                  </div>
                  <p className="text-xs text-[color:var(--oo-muted)]">
                    {e.entryDate} · {e.category?.replaceAll('_', ' ') ?? 'expense'}
                  </p>
                </div>
                <p className="font-semibold tabular-nums text-white">{paiseToInr(e.amountPaise)}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
