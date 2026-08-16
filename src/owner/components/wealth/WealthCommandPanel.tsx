'use client';

import Link from 'next/link';
import { paiseToInr } from '@/src/lib/format';
import type { WealthSnapshot } from '@/src/owner/services/wealthCalculation';
import { SourceBadge } from '@/src/owner/components/wealth/SourceBadge';

type DueItem = {
  id: string;
  name: string;
  totalDuePaise: number;
  dueDate: string | null;
};

export function WealthCommandPanel({
  wealth,
  upcomingDues,
}: {
  wealth: WealthSnapshot | null;
  upcomingDues: DueItem[];
}) {
  if (!wealth) {
    return (
      <section className="oo-empty-state">
        <p className="text-sm font-medium text-white">Wealth ledger not available</p>
        <p className="oo-meta mt-2">
          Run Owner DB migrations to enable ledger-backed net worth and cashflow.
        </p>
      </section>
    );
  }

  const month = wealth.cashFlow.month;

  return (
    <div className="space-y-5">
      <section className="oo-card oo-card-hero">
        <p className="oo-label">Net worth</p>
        <p className="oo-money-hero mt-1">{paiseToInr(wealth.netWorthPaise)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Assets" value={paiseToInr(wealth.totalAssetsPaise)} />
          <MiniStat label="Liabilities" value={paiseToInr(wealth.totalLiabilitiesPaise)} />
          <MiniStat label="Cash flow (MTD)" value={paiseToInr(month.netPaise)} />
          <MiniStat label="Property value" value={paiseToInr(wealth.propertyValuePaise)} />
        </div>
      </section>

      <section>
        <h2 className="oo-section-title mb-3">Cash flow this month</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="oo-card oo-card-compact oo-card-cashflow">
            <p className="oo-label">Income</p>
            <p className="oo-money-primary mt-1">{paiseToInr(month.incomePaise)}</p>
          </div>
          <div className="oo-card oo-card-compact oo-card-liability">
            <p className="oo-label">Expenses</p>
            <p className="oo-money-primary mt-1">{paiseToInr(month.expensePaise)}</p>
          </div>
          <div className="oo-card oo-card-compact">
            <p className="oo-label">Operating cash flow</p>
            <p className="oo-money-primary mt-1">
              {paiseToInr(wealth.wealthChange.operatingCashFlowPaise)}
            </p>
          </div>
        </div>
        <p className="oo-meta mt-2">
          Principal paid on loans ({paiseToInr(wealth.wealthChange.liabilityPrincipalPaidPaise)})
          improves net worth — not counted as expense.
        </p>
      </section>

      {wealth.expensesBySource.length > 0 ? (
        <section className="oo-card p-4">
          <h2 className="oo-section-title-strong">Expenses by source (MTD)</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {wealth.expensesBySource.map((row) => (
              <div
                key={row.sourceSystem}
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"
              >
                <SourceBadge source={row.sourceSystem} />
                <p className="oo-money-secondary mt-1">{paiseToInr(row.totalPaise)}</p>
              </div>
            ))}
          </div>
          <Link href="/expenses" className="mt-3 text-sm font-medium text-[#FF5A1F]">
            View all expenses →
          </Link>
        </section>
      ) : null}

      {upcomingDues.length > 0 ? (
        <section className="oo-card oo-card-liability p-4">
          <h2 className="oo-section-title-strong">Due soon</h2>
          <div className="mt-3 space-y-2">
            {upcomingDues.slice(0, 5).map((d) => (
              <Link
                key={d.id}
                href={`/liabilities/${d.id}`}
                className="flex justify-between text-sm font-medium text-white hover:text-[#FF5A1F]"
              >
                <span>{d.name}</span>
                <span className="tabular-nums">{paiseToInr(d.totalDuePaise)}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="oo-meta">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}
