import Link from 'next/link';
import { paiseToInr } from '@/src/lib/format';

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
};

export function PropertyPortfolioUi({ properties }: { properties: PropertyRow[] }) {
  const totalPurchase = properties.reduce((s, p) => s + p.purchasePricePaise, 0);
  const totalCurrent = properties.reduce((s, p) => s + p.currentValuePaise, 0);
  const totalAppreciation = totalCurrent - totalPurchase;

  return (
    <div className="space-y-5 md:space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="oo-page-title">Assets</h1>
          <p className="oo-page-subtitle">
            Properties and holdings with purchase basis, current value, and appreciation.
          </p>
        </div>
        <Link href="/properties/new" className="oo-btn-primary w-full sm:w-auto shrink-0">
          + Add asset
        </Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="oo-card oo-card-compact">
          <p className="oo-label">Properties</p>
          <p className="oo-money-primary mt-1">{properties.length}</p>
        </div>
        <div className="oo-card oo-card-compact">
          <p className="oo-label">Current value</p>
          <p className="oo-money-primary mt-1">{paiseToInr(totalCurrent)}</p>
        </div>
        <div className="oo-card oo-card-compact oo-card-cashflow">
          <p className="oo-label">Total appreciation</p>
          <p className="oo-money-primary mt-1 text-emerald-300">{paiseToInr(totalAppreciation)}</p>
        </div>
      </div>

      {properties.length === 0 ? (
        <div className="oo-empty-state">
          <p className="text-base font-semibold text-white">No assets yet</p>
          <p className="oo-page-subtitle mt-2">
            Add a property or other asset to track value, appreciation, and linked income.
          </p>
          <Link href="/properties/new" className="oo-btn-primary mt-4 inline-flex">
            + Add asset
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {properties.map((p) => (
            <Link
              key={p.assetId}
              href={`/assets/${p.assetId}`}
              className="oo-card block p-4 transition hover:border-[#FF5A1F]/35 active:bg-white/[0.02]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-white">{p.name}</p>
                  <p className="oo-meta mt-1">
                    {p.city ?? 'No location'}
                    {p.purchaseYear ? ` · Purchased ${p.purchaseYear}` : ''}
                    {p.propertyType ? ` · ${p.propertyType}` : ''}
                  </p>
                </div>
                <p className="oo-money-secondary shrink-0">{paiseToInr(p.currentValuePaise)}</p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/8 pt-3">
                <div>
                  <p className="oo-meta">Purchase</p>
                  <p className="oo-money-secondary mt-0.5 text-sm">{paiseToInr(p.purchasePricePaise)}</p>
                </div>
                <div>
                  <p className="oo-meta">Gain</p>
                  <p className="oo-money-secondary mt-0.5 text-sm text-emerald-300">
                    {paiseToInr(p.appreciationPaise)}
                  </p>
                </div>
                <div>
                  <p className="oo-meta">Return</p>
                  <p className="oo-money-secondary mt-0.5 text-sm">{p.appreciationPct.toFixed(1)}%</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
