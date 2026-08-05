'use client';

import { useState } from 'react';
import type { ExplainableValue } from '@/src/personalFinance/types';
import type { OwnerOsSnapshot } from '@/src/owner/brains/ownerBrain';
import { ExplainableMetricCard, ExplainPanel } from '@/src/owner/components/ExplainableMetricCard';

export function NetWorthBreakdown({ snapshot }: { snapshot: OwnerOsSnapshot }) {
  const [explain, setExplain] = useState<ExplainableValue | null>(null);
  const { netWorth, finance } = snapshot;

  const breakdown = [
    netWorth.currentNetWorth,
    netWorth.assets,
    netWorth.liabilities,
    finance.vehiclePortfolio,
    finance.investmentValue,
  ].filter((m) => m.connected !== false);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {breakdown.map((v) => (
          <ExplainableMetricCard key={v.id} value={v} onExplain={setExplain} />
        ))}
      </div>
      {finance.connectLater.length > 0 ? (
        <p className="text-sm text-[color:var(--oo-muted,#9CA3AF)]">
          {finance.connectLater.length} balance-sheet items await Engine connectors (see Connect
          later on dashboard).
        </p>
      ) : null}
      {explain ? <ExplainPanel value={explain} onClose={() => setExplain(null)} /> : null}
    </>
  );
}
