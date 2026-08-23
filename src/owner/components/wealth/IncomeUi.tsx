'use client';

import { useActionState } from 'react';
import {
  createIncomeAction,
  type WealthActionState,
} from '@/src/owner/actions/wealth';
import { AmountWithWords } from '@/src/owner/components/ui/AmountWithWords';
import { SourceBadge } from '@/src/owner/components/wealth/SourceBadge';
import { MoneyInput } from '@/src/owner/components/ui/MoneyInput';

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
  incomeBreakdown,
}: {
  cashFlow: Record<string, PeriodSummary>;
  recentIncome: IncomeRow[];
  accounts: AccountOption[];
  incomeBreakdown?: {
    propertyExpectedMonthlyPaise: number;
    propertyActualPaise: number;
    businessIncomePaise: number;
    otherIncomePaise: number;
    propertyBySource: Array<{ assetId: string; name: string; grossMonthlyPaise: number }>;
  } | null;
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
          Owner-level income (salary, dividends, business). Property income is managed on each
          property page — not duplicated here.
        </p>
      </header>

      <section className="oo-card oo-card-hero">
        <p className="oo-label">This month — gross income</p>
        <p className="oo-money-hero mt-1 oo-value-income"><AmountWithWords paise={month.incomePaise} /></p>
        <p className="oo-meta mt-2">
          Net <AmountWithWords paise={month.netPaise} /> after expenses <AmountWithWords paise={month.expensePaise} />
        </p>
      </section>

      {incomeBreakdown ? (
        <section className="oo-card p-4">
          <h2 className="oo-section-title-strong mb-3">Monthly income breakdown</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="oo-meta-bright">Property (expected recurring)</span>
              <span><AmountWithWords paise={incomeBreakdown.propertyExpectedMonthlyPaise} /></span>
            </div>
            <div className="flex justify-between">
              <span className="oo-meta-bright">Property (actual MTD)</span>
              <span><AmountWithWords paise={incomeBreakdown.propertyActualPaise} /></span>
            </div>
            <div className="flex justify-between">
              <span className="oo-meta-bright">Business</span>
              <span><AmountWithWords paise={incomeBreakdown.businessIncomePaise} /></span>
            </div>
            <div className="flex justify-between">
              <span className="oo-meta-bright">Other (manual)</span>
              <span><AmountWithWords paise={incomeBreakdown.otherIncomePaise} /></span>
            </div>
          </div>
          {incomeBreakdown.propertyBySource.length > 0 ? (
            <div className="mt-3 border-t border-white/10 pt-3 space-y-1">
              <p className="oo-label">Property drill-down</p>
              {incomeBreakdown.propertyBySource.map((p) => (
                <div key={p.assetId} className="flex justify-between text-sm">
                  <span className="oo-meta-bright">{p.name}</span>
                  <span><AmountWithWords paise={p.grossMonthlyPaise} /> / mo</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="oo-stat-grid">
        {Object.entries(cashFlow).map(([key, row]) => (
          <div key={key} className="oo-card oo-card-compact">
            <p className="oo-label">{PERIOD_LABELS[key] ?? key}</p>
            <p className="oo-money-primary mt-1 oo-value-income"><AmountWithWords paise={row.incomePaise} /></p>
            <p className="oo-meta mt-1">Net <AmountWithWords paise={row.netPaise} /></p>
          </div>
        ))}
      </div>

      <section className="oo-form-section">
        <h2 className="oo-form-section-title">Record manual income</h2>
        <form action={formAction} className="oo-form-grid">
          <input name="description" placeholder="Description" required className="oo-form-input" />
          <MoneyInput name="amountRupees" label="Amount (₹)" required />
          <div className="oo-form-field">
            <label className="oo-form-label">Date</label>
            <input
              name="incomeDate"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="oo-form-input oo-form-input-date"
            />
          </div>
          <select name="accountId" className="oo-form-input">
            <option value="">Deposit account (optional)</option>
            {accounts.map((a) => (
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
                  <AmountWithWords paise={row.amountPaise} />
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <p className="oo-meta">
        Year-to-date gross: <span className="text-white"><AmountWithWords paise={year.incomePaise} /></span>
        · Net: <span className="text-white"><AmountWithWords paise={year.netPaise} /></span>
      </p>
    </div>
  );
}
