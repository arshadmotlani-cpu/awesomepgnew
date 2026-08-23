'use client';

import Link from 'next/link';
import type { WealthSnapshot } from '@/src/owner/services/wealthCalculation';
import { SourceBadge } from '@/src/owner/components/wealth/SourceBadge';
import { AmountWithWords } from '@/src/owner/components/ui/AmountWithWords';

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
  const breakdown = wealth.assetBreakdown;

  return (
    <div className="space-y-5">
      <section className="oo-card oo-card-hero">
        <p className="oo-label">Net worth</p>
        <p className="oo-money-hero mt-1"><AmountWithWords paise={wealth.netWorthPaise} /></p>

        <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
          <BreakdownRow label="Property / fixed assets" value={breakdown.fixedAssetsPaise} />
          <BreakdownRow label="Movable assets" value={breakdown.movableAssetsPaise} />
          <BreakdownRow label="Financial / liquid" value={breakdown.financialAssetsPaise} />
          <BreakdownRow
            label="Total assets"
            value={wealth.totalAssetsPaise}
            strong
          />
          <BreakdownRow label="Liabilities" value={wealth.totalLiabilitiesPaise} tone="liability" />
          <BreakdownRow label="Net worth" value={wealth.netWorthPaise} strong highlight />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MiniStat label="Cash flow (MTD)" value={<AmountWithWords paise={month.netPaise} />} />
          <MiniStat label="Property value" value={<AmountWithWords paise={wealth.propertyValuePaise} />} />
          <MiniStat label="Bank / cash" value={<AmountWithWords paise={wealth.bankBalancePaise} />} />
        </div>
      </section>

      <section>
        <h2 className="oo-section-title mb-3">Monthly income</h2>
        <div className="oo-card p-4 space-y-2">
          <IncomeRow label="Property (expected)" value={wealth.incomeBreakdown.propertyExpectedMonthlyPaise} />
          <IncomeRow label="Property (actual MTD)" value={wealth.incomeBreakdown.propertyActualPaise} />
          <IncomeRow label="Business" value={wealth.incomeBreakdown.businessIncomePaise} />
          <IncomeRow label="Other" value={wealth.incomeBreakdown.otherIncomePaise} />
          <div className="flex justify-between border-t border-white/10 pt-2 font-semibold text-white">
            <span>Total (actual + business + other)</span>
            <span className="tabular-nums"><AmountWithWords paise={wealth.cashFlow.month.incomePaise} /></span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="oo-section-title mb-3">Cash flow this month</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="oo-card oo-card-compact oo-card-cashflow">
            <p className="oo-label">Income</p>
            <p className="oo-money-primary mt-1"><AmountWithWords paise={month.incomePaise} /></p>
          </div>
          <div className="oo-card oo-card-compact oo-card-liability">
            <p className="oo-label">Expenses</p>
            <p className="oo-money-primary mt-1"><AmountWithWords paise={month.expensePaise} /></p>
          </div>
          <div className="oo-card oo-card-compact">
            <p className="oo-label">Operating cash flow</p>
            <p className="oo-money-primary mt-1">
              <AmountWithWords paise={wealth.wealthChange.operatingCashFlowPaise} />
            </p>
          </div>
        </div>
        <p className="oo-meta mt-2">
          Principal paid on loans (<AmountWithWords paise={wealth.wealthChange.liabilityPrincipalPaidPaise} />)
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
                <p className="oo-money-secondary mt-1"><AmountWithWords paise={row.totalPaise} /></p>
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
                <span className="tabular-nums"><AmountWithWords paise={d.totalDuePaise} /></span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  strong,
  highlight,
  tone,
}: {
  label: string;
  value: number;
  strong?: boolean;
  highlight?: boolean;
  tone?: 'liability';
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? 'oo-section-title-strong text-sm' : 'oo-meta'}>{label}</span>
      <span
        className={`tabular-nums ${strong ? 'oo-money-primary' : 'text-sm text-white'} ${
          highlight ? 'text-[#FF5A1F]' : ''
        } ${tone === 'liability' ? 'text-amber-300' : ''}`}
      >
        <AmountWithWords paise={value} />
      </span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="oo-meta">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}

function IncomeRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="oo-meta-bright">{label}</span>
      <span className="tabular-nums text-white"><AmountWithWords paise={value} /></span>
    </div>
  );
}
