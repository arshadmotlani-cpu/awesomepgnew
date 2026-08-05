'use client';

import { useState } from 'react';
import { paiseToInr } from '@/src/lib/format';
import type { ExplainableValue, PersonalFinanceSnapshot } from '@/src/personalFinance/types';

function formatMetric(v: ExplainableValue): string {
  if (v.kind === 'percent' || v.kind === 'ratio') {
    return `${v.percent ?? 0}%`;
  }
  return paiseToInr(v.paise);
}

function MetricCard({
  value,
  onExplain,
}: {
  value: ExplainableValue;
  onExplain: (v: ExplainableValue) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onExplain(value)}
      className="rounded-xl border border-white/10 bg-[#1A1F27] p-4 text-left transition hover:border-[#FF5A1F]/40 focus:outline-none focus:ring-2 focus:ring-[#FF5A1F]/40"
    >
      <p className="text-[11px] uppercase tracking-wide text-apg-silver">{value.label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-white">{formatMetric(value)}</p>
      <p className="mt-2 text-[10px] text-apg-silver">
        {value.engine.replaceAll('_', ' ')}
        {value.provisional ? ' · provisional' : ''}
      </p>
    </button>
  );
}

function ExplainPanel({
  value,
  onClose,
}: {
  value: ExplainableValue;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-[#12161c] p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-apg-silver">Explain</p>
            <h2 className="text-lg font-semibold text-white">{value.label}</h2>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
              {formatMetric(value)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-apg-silver hover:bg-white/5"
          >
            ✕
          </button>
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <div>
            <dt className="text-apg-silver">Brain</dt>
            <dd className="font-medium text-white">{value.brain.replaceAll('_', ' ')}</dd>
          </div>
          <div>
            <dt className="text-apg-silver">Engine</dt>
            <dd className="font-medium text-white">{value.engine.replaceAll('_', ' ')}</dd>
          </div>
          <div>
            <dt className="text-apg-silver">Source API</dt>
            <dd className="font-mono text-xs text-emerald-300">{value.sourceApi}</dd>
          </div>
          <div>
            <dt className="text-apg-silver">Calculation</dt>
            <dd className="text-white">{value.calculation}</dd>
          </div>
          {value.lineage.length > 0 ? (
            <div>
              <dt className="text-apg-silver">Underlying</dt>
              <dd>
                <ul className="mt-1 space-y-1">
                  {value.lineage.map((l, i) => (
                    <li key={`${l.label}-${i}`} className="flex justify-between gap-3 text-white">
                      <span>{l.label}</span>
                      <span className="tabular-nums text-apg-silver">
                        {l.paise != null ? paiseToInr(l.paise) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </div>
  );
}

const PRIMARY_IDS = [
  'current_net_worth',
  'cash_available',
  'business_revenue',
  'business_expenses',
  'business_profit',
  'monthly_income',
  'cashflow',
  'financial_independence_pct',
] as const;

const INCOME_IDS = [
  'daily_income',
  'hourly_income',
  'quarterly_income',
  'yearly_income',
  'recurring_income',
  'passive_income',
] as const;

const BALANCE_IDS = [
  'assets',
  'liabilities',
  'bank_balance',
  'investment_value',
  'property_value',
  'vehicle_portfolio',
  'loans',
  'emis',
  'insurance',
  'roi_pct',
  'business_contribution_pct',
  'profit_trend_pct',
  'net_worth_trend_pct',
] as const;

export function OwnerLifeDashboard({ finance }: { finance: PersonalFinanceSnapshot }) {
  const [explain, setExplain] = useState<ExplainableValue | null>(null);
  const byId = new Map(finance.metrics.map((m) => [m.id, m]));

  const pick = (ids: readonly string[]) =>
    ids.map((id) => byId.get(id)).filter((v): v is ExplainableValue => Boolean(v));

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-[#FF5A1F]">Owner OS</p>
        <h1 className="text-lg font-semibold text-white">Your financial life</h1>
        <p className="mt-1 text-sm text-apg-silver">
          Personal Finance Brain · click any number to see Brain, Engine, calculation, and
          underlying inputs · as of {new Date(finance.asOf).toLocaleString('en-IN')}
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-medium text-apg-silver">Core position</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {pick(PRIMARY_IDS).map((v) => (
            <MetricCard key={v.id} value={v} onExplain={setExplain} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-apg-silver">Income rates</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pick(INCOME_IDS).map((v) => (
            <MetricCard key={v.id} value={v} onExplain={setExplain} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-apg-silver">Assets · liabilities · ROI</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {pick(BALANCE_IDS).map((v) => (
            <MetricCard key={v.id} value={v} onExplain={setExplain} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-apg-silver">Engine contributions</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {finance.contributions.map((c) => (
            <div
              key={c.engine}
              className="rounded-xl border border-white/10 bg-[#1A1F27] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-white">{c.label}</h3>
                <span className="text-[10px] text-apg-silver">
                  {c.available ? 'connected' : `offline${c.error ? `: ${c.error}` : ''}`}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <MetricCard value={c.revenuePaise} onExplain={setExplain} />
                <MetricCard value={c.profitPaise} onExplain={setExplain} />
                <MetricCard value={c.expensesPaise} onExplain={setExplain} />
                <MetricCard value={c.assetsPaise} onExplain={setExplain} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {explain ? <ExplainPanel value={explain} onClose={() => setExplain(null)} /> : null}
    </div>
  );
}
