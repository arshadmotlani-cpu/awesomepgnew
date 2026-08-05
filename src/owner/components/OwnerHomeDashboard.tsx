'use client';

import { useState } from 'react';
import type { ExplainableValue } from '@/src/personalFinance/types';
import { ExplainableMetricCard, ExplainPanel } from '@/src/owner/components/ExplainableMetricCard';
import type { OwnerOsSnapshot } from '@/src/owner/brains/ownerBrain';
import { BrainHealthPanel } from '@/src/owner/components/BrainHealthPanel';
import { BusinessHealthPanel } from '@/src/owner/components/BusinessHealthPanel';
import { OwnerTasksPanel } from '@/src/owner/components/OwnerTasksPanel';
import { RecentEventsPanel } from '@/src/owner/components/RecentEventsPanel';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-[color:var(--oo-muted,#9CA3AF)]">{title}</h2>
      {children}
    </section>
  );
}

function MetricGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

function ConnectLaterSection({ items }: { items: ExplainableValue[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl border border-dashed border-white/15 bg-black/20 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <h2 className="text-sm font-medium text-white">Connect later</h2>
          <p className="mt-1 text-xs text-[color:var(--oo-muted,#9CA3AF)]">
            {items.length} metric{items.length === 1 ? '' : 's'} waiting for future Engine connectors
          </p>
        </div>
        <span className="text-sm text-[#FF5A1F]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((v) => (
            <div
              key={v.id}
              className="rounded-lg border border-white/10 bg-[color:var(--oo-surface,#1A1F27)] p-3"
            >
              <p className="text-xs font-medium text-white">{v.label}</p>
              <p className="mt-1 text-sm text-[color:var(--oo-muted,#9CA3AF)]">Not Connected</p>
              <p className="mt-2 text-[10px] text-[color:var(--oo-muted,#9CA3AF)]">{v.calculation}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function OwnerHomeDashboard({ snapshot }: { snapshot: OwnerOsSnapshot }) {
  const [explain, setExplain] = useState<ExplainableValue | null>(null);
  const finance = snapshot.finance;

  const heroMetrics: ExplainableValue[] = [
    finance.currentNetWorth,
    finance.businessProfit,
    finance.cashAvailable,
    finance.monthlyIncome,
  ].filter((m) => m.connected !== false);

  const todayMetrics: ExplainableValue[] = [finance.todayIncome].filter(
    (m) => m.connected !== false,
  );

  const incomeMetrics: ExplainableValue[] = [
    finance.recurringIncome,
    finance.passiveIncome,
    finance.yearlyProfit,
  ].filter((m) => m.connected !== false);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-[#FF5A1F]">Owner OS</p>
        <h1 className="text-2xl font-semibold text-white">Your operating system</h1>
        <p className="mt-1 text-sm text-[color:var(--oo-muted,#9CA3AF)]">
          Personal Finance Brain · click any number to explain · as of{' '}
          {new Date(finance.asOf).toLocaleString('en-IN')}
        </p>
      </header>

      <Section title="Position">
        <MetricGrid>
          {heroMetrics.map((v) => (
            <ExplainableMetricCard key={v.id} value={v} onExplain={setExplain} />
          ))}
        </MetricGrid>
      </Section>

      {todayMetrics.length > 0 ? (
        <Section title="Today">
          <MetricGrid>
            {todayMetrics.map((v) => (
              <ExplainableMetricCard key={v.id} value={v} onExplain={setExplain} />
            ))}
          </MetricGrid>
        </Section>
      ) : null}

      <Section title="Income">
        <MetricGrid>
          {incomeMetrics.map((v) => (
            <ExplainableMetricCard key={v.id} value={v} onExplain={setExplain} />
          ))}
        </MetricGrid>
      </Section>

      <Section title="Businesses">
        <div className="grid gap-3 lg:grid-cols-2">
          {finance.contributions.map((c) => (
            <div
              key={c.engine}
              className="rounded-xl border border-white/10 bg-[color:var(--oo-surface,#1A1F27)] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-white">{c.label}</h3>
                <span className="text-[10px] text-[color:var(--oo-muted,#9CA3AF)]">
                  {c.available ? 'connected' : `offline${c.error ? `: ${c.error}` : ''}`}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ExplainableMetricCard value={c.revenuePaise} onExplain={setExplain} compact />
                <ExplainableMetricCard value={c.profitPaise} onExplain={setExplain} compact />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <BusinessHealthPanel finance={finance} onExplain={setExplain} />
        <BrainHealthPanel health={snapshot.brainHealth} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <OwnerTasksPanel tasks={snapshot.tasks} />
        <RecentEventsPanel events={snapshot.recentEvents} />
      </div>

      <ConnectLaterSection items={finance.connectLater} />

      {explain ? <ExplainPanel value={explain} onClose={() => setExplain(null)} /> : null}
    </div>
  );
}
