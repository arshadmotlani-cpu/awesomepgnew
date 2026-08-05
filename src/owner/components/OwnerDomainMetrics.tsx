'use client';

import type { ExplainableValue, PersonalFinanceSnapshot } from '@/src/personalFinance/types';
import { useState } from 'react';
import { ExplainableMetricCard, ExplainPanel } from '@/src/owner/components/ExplainableMetricCard';

export function OwnerDomainMetrics({
  title,
  description,
  metrics,
  connectLaterNote,
}: {
  title: string;
  description: string;
  metrics: ExplainableValue[];
  connectLaterNote?: string;
}) {
  const [explain, setExplain] = useState<ExplainableValue | null>(null);
  const connected = metrics.filter((m) => m.connected !== false);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-[#FF5A1F]">Owner OS</p>
        <h1 className="text-lg font-semibold text-white">{title}</h1>
        <p className="mt-1 text-sm text-[color:var(--oo-muted,#9CA3AF)]">{description}</p>
      </header>
      {connected.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {connected.map((v) => (
            <ExplainableMetricCard key={v.id} value={v} onExplain={setExplain} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-[color:var(--oo-muted,#9CA3AF)]">
          No connected metrics yet for this view.
        </p>
      )}
      {connectLaterNote ? (
        <p className="rounded-lg border border-dashed border-white/15 p-4 text-sm text-[color:var(--oo-muted,#9CA3AF)]">
          {connectLaterNote}
        </p>
      ) : null}
      {explain ? <ExplainPanel value={explain} onClose={() => setExplain(null)} /> : null}
    </div>
  );
}

export function pickFinanceMetrics(
  finance: PersonalFinanceSnapshot,
  ids: string[],
): ExplainableValue[] {
  const byId = new Map(finance.metrics.map((m) => [m.id, m]));
  return ids.map((id) => byId.get(id)).filter((v): v is ExplainableValue => Boolean(v));
}
