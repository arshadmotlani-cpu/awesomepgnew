'use client';

import { useActionState } from 'react';
import { paiseToInr, formatPercent } from '@/src/lib/format';
import {
  addValuationAction,
  createPropertyExpenseAction,
  type WealthActionState,
} from '@/src/owner/actions/wealth';
import { SourceBadge } from '@/src/owner/components/wealth/SourceBadge';
import { MoneyInput } from '@/src/owner/components/ui/MoneyInput';

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

type IncomeHistoryRow = {
  id: string;
  date: string;
  description: string;
  sourceSystem: string;
  amountPaise: number;
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
    purchaseDate: string | null;
    purchasePricePaise: number;
    purchaseCostsPaise: number;
    propertyType: string | null;
    city: string | null;
    linkedPgId: string | null;
    linkedPgName: string | null;
  };
  acquisitionBasisPaise: number;
  ownerAcquisitionBasisPaise: number;
  currentMarketValuePaise: number;
  ownerMarketValuePaise: number;
  appreciation: {
    appreciationPaise: number;
    appreciationPct: number;
    annualizedPct: number | null;
    ownerBasisPaise: number;
    ownerCurrentValuePaise: number;
  };
  valuations: ValuationRow[];
  yearlyProjections: YearlyProjection[];
  assumption: { annualRateBps: number } | null;
  financials: PropertyFinancials;
  incomeHistory: IncomeHistoryRow[];
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

  const ownershipPct = detail.asset.ownershipPctBps / 100;
  const annualRatePct = detail.assumption
    ? (detail.assumption.annualRateBps / 100).toFixed(1)
    : null;
  const currentMarketRupees = detail.currentMarketValuePaise / 100;

  return (
    <div className="oo-page-stack">
      <header>
        <h1 className="oo-page-title">{detail.asset.name}</h1>
        <p className="oo-page-subtitle">
          {detail.property.city ?? 'Property'}
          {detail.property.propertyType ? ` · ${detail.property.propertyType}` : ''}
          {detail.property.purchaseDate ? ` · Purchased ${detail.property.purchaseDate}` : ''}
        </p>
      </header>

      {/* ——— ASSET VALUE ——— */}
      <section className="oo-form-section">
        <h2 className="oo-section-heading">Asset value</h2>
        <div className="oo-value-breakdown">
          <Row label="Purchase price" value={paiseToInr(detail.property.purchasePricePaise)} />
          <Row label="Acquisition costs" value={paiseToInr(detail.property.purchaseCostsPaise)} />
          <Row
            label="Total acquisition basis"
            value={paiseToInr(detail.ownerAcquisitionBasisPaise)}
            strong
          />
          <Row
            label="Current market value"
            value={paiseToInr(detail.ownerMarketValuePaise)}
            strong
            highlight
          />
          <Row
            label="Appreciation"
            value={formatPercent(detail.appreciation.appreciationPct)}
            tone={detail.appreciation.appreciationPct >= 0 ? 'positive' : 'negative'}
          />
          <Row label="Your ownership" value={formatPercent(ownershipPct, 0)} />
        </div>

        <form action={valAction} className="oo-form-grid mt-4 border-t border-white/10 pt-4">
          <input type="hidden" name="assetId" value={detail.asset.id} />
          <MoneyInput
            name="valueRupees"
            label="Update current market value (₹)"
            hint="Full property value — your share is calculated from ownership %"
            defaultValue={currentMarketRupees}
            required
          />
          <div className="oo-form-field">
            <label className="oo-form-label">Valuation date</label>
            <input
              name="valuationDate"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="oo-form-input oo-form-input-date"
            />
          </div>
          <div className="oo-form-field">
            <label className="oo-form-label">Valuation type</label>
            <select name="kind" className="oo-form-input">
              <option value="MARKET_ESTIMATE">Market estimate</option>
              <option value="APPRAISAL">Appraisal</option>
              <option value="ACTUAL">Actual sale/reference</option>
            </select>
          </div>
          <button type="submit" disabled={valPending} className="oo-btn-primary">
            {valPending ? 'Saving…' : 'Save valuation'}
          </button>
        </form>
        {valState.error ? <p className="text-sm text-red-400">{valState.error}</p> : null}
        {valState.success ? <p className="text-sm text-emerald-400">{valState.success}</p> : null}
      </section>

      {detail.yearlyProjections.length > 0 && annualRatePct ? (
        <section className="oo-form-section border-dashed">
          <h2 className="oo-section-heading">Value outlook ({annualRatePct}% / year)</h2>
          <p className="oo-form-hint">
            Projections start from actual current value — illustrative only, not net worth.
          </p>
          <div className="mt-3 space-y-2">
            {detail.yearlyProjections.map((row) => (
              <div key={row.year} className="oo-card flex items-center justify-between px-3 py-2.5">
                <div>
                  <p className="oo-financial-value text-sm">{row.year}</p>
                  <p className="oo-meta-bright">
                    {row.isProjected ? 'Projected' : 'Current actual'}
                  </p>
                </div>
                <p className="oo-money-secondary">{paiseToInr(row.valuePaise)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ——— PROPERTY INCOME ——— */}
      <section className="oo-form-section oo-card-cashflow">
        <h2 className="oo-section-heading">Property income</h2>
        <p className="oo-form-hint mb-3">
          Income for this property only. Not duplicated in general My Income.
        </p>
        {detail.property.linkedPgId ? (
          <div className="mb-3 flex items-center gap-2">
            <SourceBadge source="AWESOME_PG" />
            <span className="oo-meta-bright">
              Linked to {detail.property.linkedPgName ?? 'Awesome PG'} — synced automatically
            </span>
          </div>
        ) : null}
        <div className="oo-stat-grid">
          <Stat label="Monthly income" value={paiseToInr(detail.financials.monthlyIncomePaise)} income />
          <Stat label="Yearly run rate" value={paiseToInr(detail.financials.yearlyIncomePaise)} income />
          <Stat
            label="From connected systems"
            value={paiseToInr(detail.financials.incomeSources.integrationPaise)}
          />
          <Stat
            label="Manual / configured"
            value={paiseToInr(detail.financials.incomeSources.configuredBaselinePaise)}
          />
        </div>
        {detail.incomeHistory.length > 0 ? (
          <div className="mt-3 space-y-2">
            <p className="oo-label">Income history</p>
            {detail.incomeHistory.slice(0, 8).map((row) => (
              <div key={row.id} className="flex justify-between gap-2 text-sm">
                <span className="oo-meta-bright truncate">
                  {row.date} · {row.description}
                  <SourceBadge source={row.sourceSystem} />
                </span>
                <span className="oo-value-income shrink-0">{paiseToInr(row.amountPaise)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* ——— PROPERTY EXPENSES ——— */}
      <section className="oo-form-section">
        <h2 className="oo-section-heading">Property expenses</h2>
        <div className="oo-stat-grid mb-3">
          <Stat label="Monthly expenses" value={paiseToInr(detail.financials.monthlyExpensePaise)} expense />
          <Stat label="Yearly expenses" value={paiseToInr(detail.financials.yearlyExpensePaise)} expense />
          <Stat
            label="Net monthly income"
            value={paiseToInr(detail.financials.netMonthlyIncomePaise)}
            income
          />
        </div>
        <form action={expAction} className="oo-form-grid border-t border-white/10 pt-3">
          <input type="hidden" name="assetId" value={detail.asset.id} />
          <input name="description" placeholder="Description" required className="oo-form-input" />
          <MoneyInput name="amountRupees" label="Amount (₹)" required />
          <div className="oo-form-field">
            <label className="oo-form-label">Date</label>
            <input
              name="expenseDate"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="oo-form-input oo-form-input-date"
            />
          </div>
          <select name="category" className="oo-form-input" defaultValue="PROPERTY">
            <option value="PROPERTY">Property</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="REPAIRS">Repairs</option>
            <option value="TAXES">Property tax</option>
          </select>
          <select name="frequency" className="oo-form-input" defaultValue="ONE_TIME">
            <option value="ONE_TIME">One-time</option>
            <option value="MONTHLY">Monthly recurring</option>
            <option value="YEARLY">Yearly recurring</option>
          </select>
          <button type="submit" disabled={expPending} className="oo-btn-primary">
            Record expense
          </button>
        </form>
        {expState.error ? <p className="text-sm text-red-400">{expState.error}</p> : null}
        {expState.success ? <p className="text-sm text-emerald-400">{expState.success}</p> : null}
      </section>

      {/* ——— LIABILITIES ——— */}
      {detail.liabilities.length > 0 || detail.financials.loanOutstandingPaise > 0 ? (
        <section className="oo-form-section oo-card-liability">
          <h2 className="oo-section-heading">Liabilities</h2>
          <div className="oo-stat-grid">
            <Stat
              label="Loan outstanding"
              value={paiseToInr(detail.financials.loanOutstandingPaise)}
              expense
            />
            {detail.financials.monthlyEmiPaise > 0 ? (
              <Stat label="Monthly EMI" value={paiseToInr(detail.financials.monthlyEmiPaise)} />
            ) : null}
            {detail.financials.nextDueDate ? (
              <Stat
                label={`Next due ${detail.financials.nextDueDate}`}
                value={paiseToInr(detail.financials.nextDueAmountPaise)}
                expense
              />
            ) : null}
          </div>
          {detail.liabilities.map((l) => (
            <a
              key={l.id}
              href={`/liabilities/${l.id}`}
              className="oo-card mt-2 block p-3 hover:border-red-400/30"
            >
              <div className="flex justify-between">
                <span className="oo-financial-value">{l.name}</span>
                <span className="oo-value-expense">{paiseToInr(l.currentPrincipalPaise)}</span>
              </div>
            </a>
          ))}
        </section>
      ) : null}

      {/* ——— EQUITY ——— */}
      <section className="oo-card oo-card-hero">
        <h2 className="oo-section-heading">Property equity</h2>
        <p className="oo-label">Current value − outstanding liabilities</p>
        <p className="oo-money-hero mt-1">{paiseToInr(detail.financials.equityPaise)}</p>
        <p className="oo-meta-bright mt-2">
          {paiseToInr(detail.ownerMarketValuePaise)} asset −{' '}
          {paiseToInr(detail.financials.loanOutstandingPaise)} loan
        </p>
      </section>

      {/* Valuation history */}
      {detail.valuations.length > 0 ? (
        <section>
          <h2 className="oo-section-heading mb-3">Valuation history</h2>
          <div className="space-y-2">
            {detail.valuations.map((v) => (
              <div key={v.id} className="oo-card flex items-center justify-between px-4 py-3">
                <div>
                  <p className="oo-financial-value text-sm">{v.valuationDate}</p>
                  <p className="oo-meta-bright">{v.kind.replaceAll('_', ' ')}</p>
                </div>
                <p className="oo-money-secondary">{paiseToInr(v.valuePaise)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  highlight,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  highlight?: boolean;
  tone?: 'positive' | 'negative';
}) {
  return (
    <div className="oo-value-row">
      <span className="oo-label">{label}</span>
      <span
        className={`oo-financial-value ${strong ? 'font-semibold' : ''} ${highlight ? 'oo-money-primary' : ''} ${tone === 'positive' ? 'oo-value-income' : ''} ${tone === 'negative' ? 'oo-value-expense' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  income,
  expense,
}: {
  label: string;
  value: string;
  income?: boolean;
  expense?: boolean;
}) {
  return (
    <div className="oo-card oo-card-compact">
      <p className="oo-label">{label}</p>
      <p
        className={`oo-money-primary mt-1 ${income ? 'oo-value-income' : ''} ${expense ? 'oo-value-expense' : ''}`}
      >
        {value}
      </p>
    </div>
  );
}
