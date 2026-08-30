'use client';

import { useActionState } from 'react';
import { formatPercent } from '@/src/lib/format';
import { AmountWithWords } from '@/src/owner/components/ui/AmountWithWords';
import {
  addValuationAction,
  createPropertyExpenseAction,
  type WealthActionState,
} from '@/src/owner/actions/wealth';
import { SourceBadge } from '@/src/owner/components/wealth/SourceBadge';
import { MoneyInput } from '@/src/owner/components/ui/MoneyInput';
import { PropertyIncomeSection } from '@/src/owner/components/wealth/PropertyIncomeSection';
import { StableDateInput } from '@/src/components/forms/StableDateInput';

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
  actualMonthlyIncomePaise: number;
  actualYearlyIncomePaise: number;
  loanOutstandingPaise: number;
  monthlyEmiPaise: number;
  nextDueDate: string | null;
  nextDueAmountPaise: number;
  equityPaise: number;
  incomeSources: {
    journalPaise: number;
    integrationPaise: number;
    configuredBaselinePaise: number;
    incomeSourceGrossMonthlyPaise: number;
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
  ownerEstimatedMarketValuePaise: number;
  valueSource: 'actual' | 'estimated';
  yearsHeld: number;
  estimatedAppreciationPaise: number;
  estimatedAppreciationPct: number;
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
  incomeTotals: {
    grossMonthlyPaise: number;
    grossAnnualizedPaise: number;
    activeCount: number;
    vacantCount: number;
    byType: Record<string, number>;
    pgIntegrationActualPaise: number;
    sources: Array<{
      id: string;
      name: string;
      sourceType: string;
      tenantName: string | null;
      monthlyAmountPaise: number;
      status: string;
      sourceSystem: string | null;
      isPgSynced: boolean;
      pgIntegrationActualPaise: number;
    }>;
  };
  grossRentalYieldPct: number | null;
  netRentalYieldPct: number | null;
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
          <Row label="Purchase price" paise={detail.property.purchasePricePaise} />
          {detail.property.purchaseDate ? (
            <Row label="Purchase date" value={detail.property.purchaseDate} />
          ) : null}
          <Row label="Acquisition costs" paise={detail.property.purchaseCostsPaise} />
          <Row
            label="Total acquisition basis"
            paise={detail.ownerAcquisitionBasisPaise}
            strong
          />
          {annualRatePct ? (
            <Row label="Expected appreciation" value={`${annualRatePct}% / year`} />
          ) : null}
          {detail.yearsHeld > 0 ? (
            <Row label="Years held" value={`${detail.yearsHeld} years`} />
          ) : null}
          {detail.valueSource === 'estimated' ? (
            <>
              <Row
                label="Estimated current value"
                paise={detail.ownerEstimatedMarketValuePaise}
                strong
                highlight
              />
              <Row
                label="Estimated appreciation"
                paise={detail.estimatedAppreciationPaise}
                tone={detail.estimatedAppreciationPaise >= 0 ? 'positive' : 'negative'}
              />
              <Row
                label="Estimated appreciation %"
                value={formatPercent(detail.estimatedAppreciationPct)}
                tone={detail.estimatedAppreciationPct >= 0 ? 'positive' : 'negative'}
              />
            </>
          ) : (
            <>
              <Row
                label="Current actual market value"
                paise={detail.ownerMarketValuePaise}
                strong
                highlight
              />
              {annualRatePct ? (
                <Row
                  label={`Modelled value at ${annualRatePct}% / year`}
                  paise={detail.ownerEstimatedMarketValuePaise}
                />
              ) : null}
            </>
          )}
          <Row
            label="Appreciation (on basis)"
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
            <StableDateInput
              name="valuationDate"
              required
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
            {detail.valueSource === 'actual'
              ? 'Future projections start from your recorded actual market value — illustrative only, not net worth.'
              : 'Estimated current year from appreciation model; later years projected — illustrative only, not net worth.'}
          </p>
          <div className="mt-3 space-y-2">
            {detail.yearlyProjections.map((row) => (
              <div key={row.year} className="oo-card flex items-center justify-between px-3 py-2.5">
                <div>
                  <p className="oo-financial-value text-sm">{row.year}</p>
                  <p className="oo-meta-bright">
                    {row.isProjected
                      ? 'Projected'
                      : detail.valueSource === 'actual'
                        ? 'Current actual'
                        : 'Estimated current'}
                  </p>
                </div>
                <AmountWithWords paise={row.valuePaise} align="end" amountClassName="oo-money-secondary" />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ——— PROPERTY INCOME ——— */}
      <PropertyIncomeSection
        assetId={detail.asset.id}
        linkedPgId={detail.property.linkedPgId}
        linkedPgName={detail.property.linkedPgName}
        totals={detail.incomeTotals}
        grossRentalYieldPct={detail.grossRentalYieldPct}
        netRentalYieldPct={detail.netRentalYieldPct}
      />

      {/* ——— PROPERTY EXPENSES ——— */}
      <section className="oo-form-section">
        <h2 className="oo-section-heading">Property expenses</h2>
        <div className="oo-stat-grid mb-3">
          <Stat label="Gross income" paise={detail.financials.monthlyIncomePaise} income />
          <Stat label="Expenses" paise={detail.financials.monthlyExpensePaise} expense />
          <Stat
            label="Net property income"
            paise={detail.financials.netMonthlyIncomePaise}
            income
          />
          <Stat
            label="Actual received (MTD)"
            paise={detail.financials.actualMonthlyIncomePaise}
          />
        </div>
        <form action={expAction} className="oo-form-grid border-t border-white/10 pt-3">
          <input type="hidden" name="assetId" value={detail.asset.id} />
          <input name="description" placeholder="Description" required className="oo-form-input" />
          <MoneyInput name="amountRupees" label="Amount (₹)" required />
          <div className="oo-form-field">
            <label className="oo-form-label">Date</label>
            <StableDateInput
              name="expenseDate"
              required
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
              paise={detail.financials.loanOutstandingPaise}
              expense
            />
            {detail.financials.monthlyEmiPaise > 0 ? (
              <Stat label="Monthly EMI" paise={detail.financials.monthlyEmiPaise} />
            ) : null}
            {detail.financials.nextDueDate ? (
              <Stat
                label={`Next due ${detail.financials.nextDueDate}`}
                paise={detail.financials.nextDueAmountPaise}
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
                <AmountWithWords
                  paise={l.currentPrincipalPaise}
                  align="end"
                  amountClassName="oo-value-expense"
                />
              </div>
            </a>
          ))}
        </section>
      ) : null}

      {/* ——— EQUITY ——— */}
      <section className="oo-card oo-card-hero">
        <h2 className="oo-section-heading">Property equity</h2>
        <p className="oo-label">Current value − outstanding liabilities</p>
        <AmountWithWords paise={detail.financials.equityPaise} amountClassName="oo-money-hero mt-1" />
        <p className="oo-meta-bright mt-2 flex flex-wrap items-start justify-start gap-x-2 gap-y-1">
          <AmountWithWords paise={detail.ownerMarketValuePaise} />
          <span>asset −</span>
          <AmountWithWords paise={detail.financials.loanOutstandingPaise} />
          <span>loan</span>
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
                <AmountWithWords paise={v.valuePaise} align="end" amountClassName="oo-money-secondary" />
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
  paise,
  strong,
  highlight,
  tone,
}: {
  label: string;
  value?: string;
  paise?: number;
  strong?: boolean;
  highlight?: boolean;
  tone?: 'positive' | 'negative';
}) {
  const amountClass = `oo-financial-value ${strong ? 'font-semibold' : ''} ${highlight ? 'oo-money-primary' : ''} ${tone === 'positive' ? 'oo-value-income' : ''} ${tone === 'negative' ? 'oo-value-expense' : ''}`;
  return (
    <div className="oo-value-row">
      <span className="oo-label">{label}</span>
      {paise != null ? (
        <AmountWithWords paise={paise} align="end" amountClassName={amountClass} />
      ) : (
        <span className={amountClass}>{value}</span>
      )}
    </div>
  );
}

function Stat({
  label,
  paise,
  income,
  expense,
}: {
  label: string;
  paise: number;
  income?: boolean;
  expense?: boolean;
}) {
  return (
    <div className="oo-card oo-card-compact">
      <p className="oo-label">{label}</p>
      <AmountWithWords
        paise={paise}
        amountClassName={`oo-money-primary mt-1 ${income ? 'oo-value-income' : ''} ${expense ? 'oo-value-expense' : ''}`}
      />
    </div>
  );
}
