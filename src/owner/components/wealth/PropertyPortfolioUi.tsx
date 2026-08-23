import Link from 'next/link';
import { formatPercent } from '@/src/lib/format';
import { AmountWithWords } from '@/src/owner/components/ui/AmountWithWords';

type PropertyRow = {
  assetId: string;
  name: string;
  city: string | null;
  propertyType: string | null;
  purchasePricePaise: number;
  currentValuePaise: number;
  appreciationPaise: number;
  appreciationPct: number;
  purchaseYear: string | null;
  monthlyIncomePaise: number;
  monthlyExpensePaise: number;
  loanOutstandingPaise: number;
  netEquityPaise: number;
};

function formatPropertyType(type: string | null): string {
  if (!type) return '';
  if (type === 'pg') return 'PG';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function PropertyPortfolioUi({ properties }: { properties: PropertyRow[] }) {
  const totalPurchase = properties.reduce((s, p) => s + p.purchasePricePaise, 0);
  const totalCurrent = properties.reduce((s, p) => s + p.currentValuePaise, 0);
  const totalAppreciation = totalCurrent - totalPurchase;
  const totalEquity = properties.reduce((s, p) => s + p.netEquityPaise, 0);
  const totalIncome = properties.reduce((s, p) => s + p.monthlyIncomePaise, 0);

  return (
    <div className="oo-page-stack">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="oo-page-title">Assets</h1>
          <p className="oo-page-subtitle">
            Properties with value, income, expenses, loans, and net equity at a glance.
          </p>
        </div>
        <Link href="/properties/new" className="oo-btn-primary w-full sm:w-auto shrink-0">
          + Add asset
        </Link>
      </header>

      <div className="oo-stat-grid">
        <div className="oo-card oo-card-compact">
          <p className="oo-label">Properties</p>
          <p className="oo-money-primary mt-1">{properties.length}</p>
        </div>
        <div className="oo-card oo-card-compact">
          <p className="oo-label">Current value</p>
          <p className="oo-money-primary mt-1"><AmountWithWords paise={totalCurrent} /></p>
        </div>
        <div className="oo-card oo-card-compact oo-card-cashflow">
          <p className="oo-label">Net equity</p>
          <p className="oo-money-primary mt-1 oo-value-income"><AmountWithWords paise={totalEquity} /></p>
        </div>
        <div className="oo-card oo-card-compact">
          <p className="oo-label">Monthly income</p>
          <p className="oo-money-primary mt-1 oo-value-income"><AmountWithWords paise={totalIncome} /></p>
        </div>
      </div>

      {properties.length === 0 ? (
        <div className="oo-empty-state">
          <p className="text-base font-semibold text-white">No assets yet</p>
          <p className="oo-page-subtitle mt-2">
            Add a property to track value, appreciation, PG income, expenses, and loan equity.
          </p>
          <Link href="/properties/new" className="oo-btn-primary mt-4 inline-flex">
            + Add asset
          </Link>
        </div>
      ) : (
        <div className="oo-page-stack">
          {properties.map((p) => (
            <Link
              key={p.assetId}
              href={`/assets/${p.assetId}`}
              className="oo-asset-card block"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-white">{p.name}</p>
                  <p className="oo-meta mt-1">
                    {formatPropertyType(p.propertyType)}
                    {p.city ? ` · ${p.city}` : ''}
                    {p.purchaseYear ? ` · Purchased ${p.purchaseYear}` : ''}
                  </p>
                </div>
                <p className="oo-money-secondary shrink-0"><AmountWithWords paise={p.currentValuePaise} /></p>
              </div>

              <div className="oo-asset-metrics mt-3">
                <Metric label="Purchase" value=<AmountWithWords paise={p.purchasePricePaise} /> />
                <Metric
                  label="Gain"
                  value={`${p.appreciationPct >= 0 ? '+' : ''}${formatPercent(p.appreciationPct)}`}
                  tone={p.appreciationPct >= 0 ? 'positive' : 'negative'}
                />
                <Metric
                  label="Income/mo"
                  value=<AmountWithWords paise={p.monthlyIncomePaise} />
                  tone="income"
                />
                <Metric
                  label="Expenses/mo"
                  value=<AmountWithWords paise={p.monthlyExpensePaise} />
                  tone="expense"
                />
                <Metric
                  label="Loan"
                  value=<AmountWithWords paise={p.loanOutstandingPaise} />
                  tone="liability"
                />
                <Metric
                  label="Equity"
                  value=<AmountWithWords paise={p.netEquityPaise} />
                  tone="income"
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | 'income' | 'expense' | 'liability';
}) {
  const toneClass =
    tone === 'positive' || tone === 'income'
      ? 'oo-value-income'
      : tone === 'negative' || tone === 'expense' || tone === 'liability'
        ? 'oo-value-expense'
        : '';

  return (
    <div className="oo-asset-metric">
      <p className="oo-meta">{label}</p>
      <p className={`oo-money-secondary mt-0.5 text-sm ${toneClass}`}>{value}</p>
    </div>
  );
}
