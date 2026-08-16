'use client';

import { useActionState } from 'react';
import { paiseToInr } from '@/src/lib/format';
import {
  addValuationAction,
  createPropertyExpenseAction,
  type WealthActionState,
} from '@/src/owner/actions/wealth';
import { SourceBadge } from '@/src/owner/components/wealth/SourceBadge';

type ValuationRow = {
  id: string;
  valuationDate: string;
  valuePaise: number;
  kind: string;
};

type YearlyProjection = {
  year: number;
  yearsAhead: number;
  valuePaise: number;
  isProjected: boolean;
};

type PropertyAnalytics = {
  capitalAppreciationPaise: number;
  capitalAppreciationPct: number;
  annualizedRoiPct: number | null;
  rentalYieldPct: number | null;
  netRentalYieldPct: number | null;
  netYearlyIncomePaise: number;
};

type PropertyFinancials = {
  monthlyIncomePaise: number;
  monthlyExpensePaise: number;
  yearlyIncomePaise: number;
  yearlyExpensePaise: number;
  netMonthlyIncomePaise: number;
  netYearlyIncomePaise: number;
  loanOutstandingPaise: number;
  monthlyEmiPaise: number;
  nextDueDate: string | null;
  nextDueAmountPaise: number;
  equityPaise: number;
  incomeSources: {
    journalPaise: number;
    integrationPaise: number;
    configuredBaselinePaise: number;
  };
};

type LiabilitySummary = {
  id: string;
  name: string;
  currentPrincipalPaise: number;
  fixedPaymentPaise: number | null;
};

type PropertyDetail = {
  asset: { id: string; name: string; ownershipPctBps: number };
  property: {
    address: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    postalCode: string | null;
    purchaseDate: string | null;
    purchasePricePaise: number;
    purchaseCostsPaise: number;
    propertyType: string | null;
    linkedPgId: string | null;
    linkedPgName: string | null;
    appreciationMethod: string;
  };
  currentValuePaise: number;
  appreciation: {
    appreciationPaise: number;
    appreciationPct: number;
    annualizedPct: number | null;
    ownerBasisPaise: number;
    ownerCurrentValuePaise: number;
  };
  valuations: ValuationRow[];
  projections: {
    oneYear: number;
    threeYears: number;
    fiveYears: number;
    tenYears: number;
  } | null;
  assumption: { annualRateBps: number } | null;
  yearlyProjections: YearlyProjection[];
  financials: PropertyFinancials;
  analytics: PropertyAnalytics;
  liabilities: LiabilitySummary[];
};

export function PropertyDetailUi({ detail }: { detail: PropertyDetail }) {
  const [valState, valAction, valPending] = useActionState<WealthActionState, FormData>(
    addValuationAction,
    {},
  );
  const [expState, expAction, expPending] = useActionState<WealthActionState, FormData>(
    createPropertyExpenseAction,
    {},
  );

  const annualRatePct = detail.assumption
    ? (detail.assumption.annualRateBps / 100).toFixed(1)
    : null;
  const purchaseYear = detail.property.purchaseDate?.slice(0, 4) ?? '—';
  const totalInvested =
    detail.property.purchasePricePaise + detail.property.purchaseCostsPaise;

  return (
    <div className="oo-page-stack">
      <header>
        <h1 className="oo-page-title">{detail.asset.name}</h1>
        <p className="oo-page-subtitle">
          {detail.property.city ?? detail.property.address ?? 'Property asset'}
          {detail.property.propertyType ? ` · ${detail.property.propertyType}` : ''}
        </p>
      </header>

      <section className="oo-card oo-card-hero">
        <p className="oo-label">Current value · your share</p>
        <p className="oo-money-hero mt-1">
          {paiseToInr(detail.appreciation.ownerCurrentValuePaise)}
        </p>
        <p className="oo-meta mt-2">
          <span className="oo-value-income">
            +{paiseToInr(detail.appreciation.appreciationPaise)} (
            {detail.appreciation.appreciationPct.toFixed(1)}%
          </span>
          {detail.appreciation.annualizedPct != null
            ? ` · ${detail.appreciation.annualizedPct.toFixed(1)}% annualized`
            : ''}
        </p>
      </section>

      <div className="oo-stat-grid">
        <StatCard label="Net equity" value={paiseToInr(detail.financials.equityPaise)} highlight />
        <StatCard
          label="Monthly income"
          value={paiseToInr(detail.financials.monthlyIncomePaise)}
          tone="income"
        />
        <StatCard
          label="Monthly expenses"
          value={paiseToInr(detail.financials.monthlyExpensePaise)}
          tone="expense"
        />
        <StatCard
          label="Net monthly"
          value={paiseToInr(detail.financials.netMonthlyIncomePaise)}
          tone="income"
        />
        <StatCard
          label="Loan outstanding"
          value={paiseToInr(detail.financials.loanOutstandingPaise)}
          tone="liability"
        />
        <StatCard
          label="Yearly income"
          value={paiseToInr(detail.financials.yearlyIncomePaise)}
          tone="income"
        />
      </div>

      {detail.property.linkedPgId ? (
        <div className="oo-card oo-card-compact flex items-center gap-2">
          <SourceBadge source="AWESOME_PG" />
          <p className="oo-meta">
            Linked to {detail.property.linkedPgName ?? 'Awesome PG'} — income synced, not
            double-counted.
          </p>
        </div>
      ) : null}

      <section className="oo-form-section">
        <h2 className="oo-form-section-title">Investment summary</h2>
        <div className="oo-stat-grid">
          <StatCard label="Purchase price" value={paiseToInr(detail.property.purchasePricePaise)} />
          <StatCard label="Purchase year" value={purchaseYear} />
          <StatCard label="Total invested" value={paiseToInr(totalInvested)} />
          <StatCard
            label="Your ownership"
            value={`${(detail.asset.ownershipPctBps / 100).toFixed(0)}%`}
          />
          <StatCard label="Your basis" value={paiseToInr(detail.appreciation.ownerBasisPaise)} />
          <StatCard
            label="Appreciation"
            value={paiseToInr(detail.appreciation.appreciationPaise)}
            tone="income"
          />
        </div>
      </section>

      <section className="oo-form-section">
        <h2 className="oo-form-section-title">Performance analytics</h2>
        <div className="oo-stat-grid">
          <StatCard
            label="Capital appreciation"
            value={`${detail.analytics.capitalAppreciationPct.toFixed(1)}%`}
            tone="income"
          />
          <StatCard
            label="Rental yield"
            value={
              detail.analytics.rentalYieldPct != null
                ? `${detail.analytics.rentalYieldPct.toFixed(2)}%`
                : '—'
            }
          />
          <StatCard
            label="Net rental yield"
            value={
              detail.analytics.netRentalYieldPct != null
                ? `${detail.analytics.netRentalYieldPct.toFixed(2)}%`
                : '—'
            }
            tone="income"
          />
          <StatCard
            label="Annualized ROI"
            value={
              detail.analytics.annualizedRoiPct != null
                ? `${detail.analytics.annualizedRoiPct.toFixed(2)}%`
                : '—'
            }
          />
          <StatCard
            label="Net yearly income"
            value={paiseToInr(detail.analytics.netYearlyIncomePaise)}
            tone="income"
          />
        </div>
      </section>

      {detail.liabilities.length > 0 ? (
        <section className="oo-form-section oo-card-liability">
          <h2 className="oo-form-section-title">Linked loans</h2>
          <div className="oo-page-stack">
            {detail.liabilities.map((l) => (
              <a
                key={l.id}
                href={`/liabilities/${l.id}`}
                className="oo-card block p-3 transition hover:border-red-400/30"
              >
                <div className="flex justify-between gap-3">
                  <p className="font-medium text-white">{l.name}</p>
                  <p className="oo-money-secondary oo-value-expense">
                    {paiseToInr(l.currentPrincipalPaise)}
                  </p>
                </div>
                {l.fixedPaymentPaise ? (
                  <p className="oo-meta mt-1">
                    EMI {paiseToInr(l.fixedPaymentPaise)}
                  </p>
                ) : null}
              </a>
            ))}
          </div>
          {detail.financials.nextDueDate ? (
            <p className="oo-meta mt-2">
              Next due {detail.financials.nextDueDate}:{' '}
              <span className="text-white">{paiseToInr(detail.financials.nextDueAmountPaise)}</span>
            </p>
          ) : null}
        </section>
      ) : null}

      {detail.yearlyProjections.length > 0 && annualRatePct ? (
        <section className="oo-form-section border-dashed">
          <h2 className="oo-form-section-title">Value outlook ({annualRatePct}% / year)</h2>
          <p className="oo-form-hint">
            Illustrative projections — not included in net worth until recorded as valuations.
          </p>
          <div className="mt-3 space-y-2">
            {detail.yearlyProjections.map((row) => (
              <div key={row.year} className="oo-card flex items-center justify-between px-3 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-white">{row.year}</p>
                  <p className="oo-meta">
                    {row.isProjected ? 'Projected' : 'Current actual'}
                  </p>
                </div>
                <p className="oo-money-secondary">{paiseToInr(row.valuePaise)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="oo-form-section">
        <h2 className="oo-form-section-title">Add property expense</h2>
        <form action={expAction} className="oo-form-grid">
          <input type="hidden" name="assetId" value={detail.asset.id} />
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
            name="expenseDate"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="oo-form-input"
          />
          <select name="category" className="oo-form-input" defaultValue="PROPERTY">
            <option value="PROPERTY">Property</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="REPAIRS">Repairs</option>
            <option value="TAXES">Property tax</option>
            <option value="OTHER">Other</option>
          </select>
          <select name="frequency" className="oo-form-input" defaultValue="ONE_TIME">
            <option value="ONE_TIME">One-time</option>
            <option value="MONTHLY">Monthly recurring</option>
            <option value="YEARLY">Yearly recurring</option>
          </select>
          <button type="submit" disabled={expPending} className="oo-btn-primary">
            {expPending ? 'Saving…' : 'Record expense'}
          </button>
        </form>
        {expState.error ? <p className="text-sm text-red-400">{expState.error}</p> : null}
        {expState.success ? <p className="text-sm text-emerald-400">{expState.success}</p> : null}
      </section>

      <section className="oo-form-section">
        <h2 className="oo-form-section-title">Update actual value</h2>
        <form action={valAction} className="oo-form-grid">
          <input type="hidden" name="assetId" value={detail.asset.id} />
          <input
            name="valueRupees"
            type="number"
            step="0.01"
            placeholder="Estimated value (₹)"
            required
            className="oo-form-input oo-form-input-money"
          />
          <input
            name="valuationDate"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="oo-form-input"
          />
          <select name="kind" className="oo-form-input">
            <option value="MARKET_ESTIMATE">Market estimate</option>
            <option value="APPRAISAL">Appraisal</option>
            <option value="ACTUAL">Actual sale/reference</option>
          </select>
          <button type="submit" disabled={valPending} className="oo-btn-primary">
            {valPending ? 'Saving…' : 'Save valuation'}
          </button>
        </form>
        {valState.error ? <p className="text-sm text-red-400">{valState.error}</p> : null}
        {valState.success ? <p className="text-sm text-emerald-400">{valState.success}</p> : null}
      </section>

      <section>
        <h2 className="oo-section-title-strong mb-3">Valuation history</h2>
        <div className="space-y-2">
          {detail.valuations.length === 0 ? (
            <p className="oo-meta">No valuations recorded yet.</p>
          ) : (
            detail.valuations.map((v) => (
              <div key={v.id} className="oo-card flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">{v.valuationDate}</p>
                  <p className="oo-meta">{v.kind.replaceAll('_', ' ')}</p>
                </div>
                <p className="oo-money-secondary">{paiseToInr(v.valuePaise)}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
  tone,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: 'income' | 'expense' | 'liability';
}) {
  const toneClass =
    tone === 'income'
      ? 'oo-value-income'
      : tone === 'expense' || tone === 'liability'
        ? 'oo-value-expense'
        : '';

  return (
    <div className={`oo-card oo-card-compact ${highlight ? 'oo-card-hero' : ''}`}>
      <p className="oo-label">{label}</p>
      <p className={`oo-money-primary mt-1 ${toneClass}`}>{value}</p>
    </div>
  );
}
