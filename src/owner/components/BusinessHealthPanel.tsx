'use client';

import type { ExplainableValue, PersonalFinanceSnapshot } from '@/src/personalFinance/types';
import { ExplainableMetricCard } from '@/src/owner/components/ExplainableMetricCard';

export function BusinessHealthPanel({
  finance,
  onExplain,
}: {
  finance: PersonalFinanceSnapshot;
  onExplain: (v: ExplainableValue) => void;
}) {
  const signals = [finance.businessContributionPct, finance.roiPct].filter(
    (m) => m.connected !== false,
  );

  return (
    <section className="rounded-xl border border-white/10 bg-[color:var(--oo-surface,#1A1F27)] p-4">
      <h2 className="text-sm font-semibold text-white">Business Health</h2>
      <p className="mt-1 text-xs text-[color:var(--oo-muted,#9CA3AF)]">
        Per-engine signals from connected APIs
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {signals.map((v) => (
          <ExplainableMetricCard key={v.id} value={v} onExplain={onExplain} compact />
        ))}
      </div>
      <ul className="mt-3 space-y-1 text-xs text-[color:var(--oo-muted,#9CA3AF)]">
        {finance.contributions.map((c) => (
          <li key={c.engine}>
            {c.label}: {c.available ? 'online' : 'offline'}
          </li>
        ))}
      </ul>
    </section>
  );
}
