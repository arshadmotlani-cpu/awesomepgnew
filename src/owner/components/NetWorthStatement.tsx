import Link from 'next/link';
import { AmountWithWords } from '@/src/owner/components/ui/AmountWithWords';

export type NetWorthLiabilityRow = {
  id: string;
  name: string;
  balancePaise: number;
};

/**
 * Dedicated Net Worth statement: assets − liabilities = net worth.
 * Uses ledger SSOT figures — same totals as the dashboard wealth panel.
 */
export function NetWorthStatement({
  totalAssetsPaise,
  totalLiabilitiesPaise,
  netWorthPaise,
  grossNetWorthPaise,
  assetBreakdown,
  liabilities,
  asOf,
}: {
  totalAssetsPaise: number;
  totalLiabilitiesPaise: number;
  netWorthPaise: number;
  grossNetWorthPaise: number;
  assetBreakdown: {
    fixedAssetsPaise: number;
    movableAssetsPaise: number;
    financialAssetsPaise: number;
  };
  liabilities: NetWorthLiabilityRow[];
  asOf: string;
}) {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-[#FF5A1F]">Net Worth</p>
        <h1 className="mt-1 text-lg font-semibold text-white">What you are worth after debts</h1>
        <p className="mt-1 text-sm text-[color:var(--oo-muted)]">
          Total assets − total liabilities · as of {asOf}
        </p>
      </header>

      <section className="oo-card oo-card-hero">
        <p className="oo-label">Net worth</p>
        <p className="oo-meta mt-1">Your total wealth after liabilities</p>
        <p className="oo-money-hero mt-1">
          <AmountWithWords paise={netWorthPaise} />
        </p>

        <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-[color:var(--oo-muted)]">Total assets</span>
            <span className="font-medium tabular-nums text-white">
              <AmountWithWords paise={totalAssetsPaise} />
            </span>
          </div>
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-amber-300/90">Less: liabilities</span>
            <span className="font-medium tabular-nums text-amber-200">
              <AmountWithWords paise={totalLiabilitiesPaise} />
            </span>
          </div>
          <div className="flex justify-between gap-3 border-t border-white/10 pt-3 text-sm font-semibold text-white">
            <span>Net worth</span>
            <span className="tabular-nums text-[#FF5A1F]">
              <AmountWithWords paise={netWorthPaise} />
            </span>
          </div>
        </div>
      </section>

      <section className="oo-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="oo-section-title-strong">Assets</h2>
          <Link href="/assets" className="text-sm font-medium text-[#FF5A1F] hover:underline">
            Manage →
          </Link>
        </div>
        <ul className="mt-3 space-y-2">
          <li className="flex justify-between gap-3 text-sm text-white">
            <span className="text-[color:var(--oo-muted)]">Property / fixed</span>
            <span className="tabular-nums">
              <AmountWithWords paise={assetBreakdown.fixedAssetsPaise} />
            </span>
          </li>
          <li className="flex justify-between gap-3 text-sm text-white">
            <span className="text-[color:var(--oo-muted)]">Movable</span>
            <span className="tabular-nums">
              <AmountWithWords paise={assetBreakdown.movableAssetsPaise} />
            </span>
          </li>
          <li className="flex justify-between gap-3 text-sm text-white">
            <span className="text-[color:var(--oo-muted)]">Financial / liquid</span>
            <span className="tabular-nums">
              <AmountWithWords paise={assetBreakdown.financialAssetsPaise} />
            </span>
          </li>
          <li className="flex justify-between gap-3 border-t border-white/10 pt-2 text-sm font-semibold text-white">
            <span>Total assets (= Gross net worth)</span>
            <span className="tabular-nums">
              <AmountWithWords paise={grossNetWorthPaise} />
            </span>
          </li>
        </ul>
      </section>

      <section className="oo-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="oo-section-title-strong">Liabilities</h2>
          <Link href="/liabilities" className="text-sm font-medium text-[#FF5A1F] hover:underline">
            Manage →
          </Link>
        </div>
        {liabilities.length === 0 ? (
          <p className="oo-meta mt-3">No active liabilities on the ledger.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {liabilities.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/liabilities/${row.id}`}
                  className="flex justify-between gap-3 text-sm font-medium text-white hover:text-[#FF5A1F]"
                >
                  <span>{row.name}</span>
                  <span className="tabular-nums">
                    <AmountWithWords paise={row.balancePaise} />
                  </span>
                </Link>
              </li>
            ))}
            <li className="flex justify-between gap-3 border-t border-white/10 pt-2 text-sm font-semibold text-white">
              <span>Total liabilities</span>
              <span className="tabular-nums">
                <AmountWithWords paise={totalLiabilitiesPaise} />
              </span>
            </li>
          </ul>
        )}
      </section>

      <p className="oo-meta">
        Dashboard shows <strong className="text-white">Gross net worth</strong> (total assets). This
        page shows <strong className="text-white">Net worth</strong> after subtracting liabilities.
        Both use the same asset and liability ledger.
      </p>
    </div>
  );
}
