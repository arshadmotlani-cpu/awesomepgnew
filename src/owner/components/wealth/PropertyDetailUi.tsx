'use client';

import { useActionState } from 'react';
import { paiseToInr } from '@/src/lib/format';
import {
  addValuationAction,
  type WealthActionState,
} from '@/src/owner/actions/wealth';

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

type PropertyDetail = {
  asset: { id: string; name: string; ownershipPctBps: number };
  property: {
    address: string | null;
    city: string | null;
    purchaseDate: string | null;
    purchasePricePaise: number;
    purchaseCostsPaise: number;
    propertyType: string | null;
    linkedPgId: string | null;
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
};

export function PropertyDetailUi({ detail }: { detail: PropertyDetail }) {
  const [state, formAction, pending] = useActionState<WealthActionState, FormData>(
    addValuationAction,
    {},
  );

  const annualRatePct = detail.assumption
    ? (detail.assumption.annualRateBps / 100).toFixed(1)
    : null;
  const purchaseYear = detail.property.purchaseDate?.slice(0, 4) ?? '—';
  const totalInvested =
    detail.property.purchasePricePaise + detail.property.purchaseCostsPaise;

  return (
    <div className="space-y-5 md:space-y-6">
      <header>
        <h1 className="oo-page-title">{detail.asset.name}</h1>
        <p className="oo-page-subtitle">
          {detail.property.city ?? detail.property.address ?? 'Property asset'}
          {detail.property.propertyType ? ` · ${detail.property.propertyType}` : ''}
        </p>
      </header>

      <section className="oo-card oo-card-hero">
        <p className="oo-label">Current estimated value</p>
        <p className="oo-money-hero mt-1">
          {paiseToInr(detail.appreciation.ownerCurrentValuePaise)}
        </p>
        <p className="oo-meta mt-2">
          Unrealized gain {paiseToInr(detail.appreciation.appreciationPaise)} (
          {detail.appreciation.appreciationPct.toFixed(1)}%
          {detail.appreciation.annualizedPct != null
            ? ` · ${detail.appreciation.annualizedPct.toFixed(1)}% annualized`
            : ''}
          )
        </p>
      </section>

      <section className="oo-card p-4">
        <h2 className="oo-section-title-strong">Investment summary</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Stat label="Purchase price" value={paiseToInr(detail.property.purchasePricePaise)} />
          <Stat label="Purchase year" value={purchaseYear} />
          <Stat label="Total invested" value={paiseToInr(totalInvested)} />
          <Stat label="Your ownership" value={`${(detail.asset.ownershipPctBps / 100).toFixed(0)}%`} />
          <Stat
            label="Your purchase basis"
            value={paiseToInr(detail.appreciation.ownerBasisPaise)}
          />
          <Stat
            label="Appreciation"
            value={paiseToInr(detail.appreciation.appreciationPaise)}
            highlight
          />
        </div>
        {detail.property.linkedPgId ? (
          <p className="oo-meta mt-3">
            Linked PG income appears in Integrations — not duplicated here.
          </p>
        ) : null}
      </section>

      {detail.yearlyProjections.length > 0 ? (
        <section className="rounded-xl border border-dashed border-white/15 bg-black/20 p-4">
          <h2 className="oo-section-title-strong">
            Value outlook ({annualRatePct}% / year)
          </h2>
          <p className="oo-meta mt-1">
            Projections are illustrative — not included in net worth until recorded as actual
            valuations.
          </p>
          <div className="mt-3 space-y-2">
            {detail.yearlyProjections.map((row) => (
              <div
                key={row.year}
                className="flex items-center justify-between rounded-lg border border-white/8 bg-[color:var(--oo-surface)] px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{row.year}</p>
                  <p className="oo-meta">
                    {row.isProjected ? 'Projected value' : 'Current actual value'}
                  </p>
                </div>
                <p
                  className={`oo-money-secondary ${row.isProjected ? 'text-[color:var(--oo-text-secondary)]' : ''}`}
                >
                  {paiseToInr(row.valuePaise)}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="oo-card p-4">
        <h2 className="oo-section-title-strong">Update actual value</h2>
        <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="assetId" value={detail.asset.id} />
          <input
            name="valueRupees"
            type="number"
            step="0.01"
            placeholder="Estimated value (₹)"
            required
            className="min-h-11 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
          />
          <input
            name="valuationDate"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="min-h-11 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
          />
          <select
            name="kind"
            className="min-h-11 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
          >
            <option value="MARKET_ESTIMATE">Market estimate</option>
            <option value="APPRAISAL">Appraisal</option>
            <option value="ACTUAL">Actual sale/reference</option>
          </select>
          <button
            type="submit"
            disabled={pending}
            className="oo-btn-primary disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save valuation'}
          </button>
        </form>
        {state.error ? <p className="mt-2 text-sm text-red-400">{state.error}</p> : null}
        {state.success ? <p className="mt-2 text-sm text-emerald-400">{state.success}</p> : null}
      </section>

      <section>
        <h2 className="oo-section-title mb-3">Valuation history</h2>
        <div className="space-y-2">
          {detail.valuations.length === 0 ? (
            <p className="oo-meta">No valuations recorded yet.</p>
          ) : (
            detail.valuations.map((v) => (
              <div
                key={v.id}
                className="oo-card flex items-center justify-between px-4 py-3"
              >
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

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2.5">
      <p className="oo-meta">{label}</p>
      <p
        className={`mt-1 text-sm font-semibold tabular-nums ${highlight ? 'text-emerald-300' : 'text-white'}`}
      >
        {value}
      </p>
    </div>
  );
}
