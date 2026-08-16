'use client';

import { useActionState } from 'react';
import { paiseToInr } from '@/src/lib/format';
import {
  createIncomeAction,
  type WealthActionState,
} from '@/src/owner/actions/wealth';
import { SourceBadge } from '@/src/owner/components/wealth/SourceBadge';

type IncomeRow = {
  id: string;
  entryDate: string;
  description: string;
  sourceSystem: string;
  amountPaise: number;
  assetId: string | null;
};

type PeriodSummary = {
  incomePaise: number;
  expensePaise: number;
  netPaise: number;
};

type AccountOption = { id: string; name: string };
type AssetOption = { id: string; name: string };

const PERIOD_LABELS: Record<string, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  quarter: 'This quarter',
  year: 'This year',
  lifetime: 'Lifetime',
};

export function IncomeUi({
  cashFlow,
  recentIncome,
  accounts,
  assets,
}: {
  cashFlow: Record<string, PeriodSummary>;
  recentIncome: IncomeRow[];
  accounts: AccountOption[];
  assets: AssetOption[];
}) {
  const [state, formAction, pending] = useActionState<WealthActionState, FormData>(
    createIncomeAction,
    {},
  );

  const month = cashFlow.month ?? { incomePaise: 0, expensePaise: 0, netPaise: 0 };
  const year = cashFlow.year ?? { incomePaise: 0, expensePaise: 0, netPaise: 0 };

  return (
    <div className="oo-page-stack">
      <header>
        <h1 className="oo-page-title">Income</h1>
        <p className="oo-page-subtitle">
          Aggregated from connected engines and manual entries. No double counting.
        </p>
      </header>

      <section className="oo-card oo-card-hero">
        <p className="oo-label">This month — gross income</p>
        <p className="oo-money-hero mt-1 oo-value-income">{paiseToInr(month.incomePaise)}</p>
        <p className="oo-meta mt-2">
          Net {paiseToInr(month.netPaise)} after expenses {paiseToInr(month.expensePaise)}
        </p>
      </section>

      <div className="oo-stat-grid">
        {Object.entries(cashFlow).map(([key, row]) => (
          <div key={key} className="oo-card oo-card-compact">
            <p className="oo-label">{PERIOD_LABELS[key] ?? key}</p>
            <p className="oo-money-primary mt-1 oo-value-income">{paiseToInr(row.incomePaise)}</p>
            <p className="oo-meta mt-1">Net {paiseToInr(row.netPaise)}</p>
          </div>
        ))}
      </div>

      <section className="oo-form-section">
        <h2 className="oo-form-section-title">Record manual income</h2>
        <form action={formAction} className="oo-form-grid">
          <input name="description" placeholder="Description" required className="oo-form-input" />
          <input
            name="amountRupees"
            type="number"
            step="0.01"
            placeholder="Amount (₹)"
            required
            className="oo-form-input oo-form-input-money"
          />
          <input
            name="incomeDate"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="oo-form-input"
          />
          <select name="accountId" className="oo-form-input">
            <option value="">Deposit account (optional)</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select name="assetId" className="oo-form-input">
            <option value="">Link to property (optional)</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button type="submit" disabled={pending} className="oo-btn-primary">
            {pending ? 'Saving…' : 'Record income'}
          </button>
        </form>
        {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-emerald-400">{state.success}</p> : null}
      </section>

      <section>
        <h2 className="oo-section-title-strong mb-3">Recent income</h2>
        <div className="space-y-2">
          {recentIncome.length === 0 ? (
            <p className="oo-meta">No manual income recorded yet. Connected engine income appears after sync.</p>
          ) : (
            recentIncome.map((row) => (
              <div key={row.id} className="oo-card flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white truncate">{row.description}</p>
                    <SourceBadge source={row.sourceSystem} />
                  </div>
                  <p className="oo-meta">{row.entryDate}</p>
                </div>
                <p className="oo-money-secondary oo-value-income shrink-0">
                  {paiseToInr(row.amountPaise)}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <p className="oo-meta">
        Year-to-date gross: <span className="text-white">{paiseToInr(year.incomePaise)}</span>
        · Net: <span className="text-white">{paiseToInr(year.netPaise)}</span>
      </p>
    </div>
  );
}
