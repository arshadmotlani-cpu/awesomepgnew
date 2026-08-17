'use client';

import Link from 'next/link';
import { paiseToInr, formatPercent } from '@/src/lib/format';

type MovableRow = {
  assetId: string;
  name: string;
  movableType: string;
  make: string | null;
  model: string | null;
  purchasePricePaise: number;
  currentValuePaise: number;
  purchaseDate: string | null;
  isDepreciation: boolean;
  annualRatePct: number;
};

export function MovablePortfolioUi({ movables }: { movables: MovableRow[] }) {
  return (
    <section className="oo-form-section">
      <h2 className="oo-section-heading">Movable assets</h2>
      <p className="oo-meta mb-4">
        Vehicles and equipment — depreciation model, not property appreciation.
      </p>
      <div className="space-y-3">
        {movables.map((m) => {
          const gainLoss = m.currentValuePaise - m.purchasePricePaise;
          const gainPct =
            m.purchasePricePaise > 0 ? (gainLoss / m.purchasePricePaise) * 100 : 0;
          return (
            <Link
              key={m.assetId}
              href={`/assets/movable/${m.assetId}`}
              className="oo-card block p-4 transition hover:border-[#FF5A1F]/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="oo-financial-value">{m.name}</p>
                  <p className="oo-meta-bright">
                    {m.movableType}
                    {m.make ? ` · ${m.make}` : ''}
                    {m.model ? ` ${m.model}` : ''}
                  </p>
                </div>
                <p className="oo-money-secondary">{paiseToInr(m.currentValuePaise)}</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Stat label="Purchase" value={paiseToInr(m.purchasePricePaise)} />
                <Stat
                  label={m.isDepreciation ? 'Depreciation' : 'Appreciation'}
                  value={formatPercent(m.annualRatePct)}
                />
                <Stat
                  label="Gain / loss"
                  value={paiseToInr(gainLoss)}
                  tone={gainLoss >= 0 ? 'positive' : 'negative'}
                />
                <Stat label="Gain / loss %" value={formatPercent(gainPct)} />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'negative';
}) {
  return (
    <div>
      <p className="oo-meta">{label}</p>
      <p
        className={`font-medium tabular-nums ${
          tone === 'positive' ? 'text-emerald-400' : tone === 'negative' ? 'text-red-400' : 'text-white'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
