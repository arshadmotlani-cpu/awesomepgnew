'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';
import {
  CapitalAllocationDonut,
  MonthlyProfitBars,
  PurchasesVsSalesBars,
} from '@/src/capital/components/charts/OverviewCharts';
import { CountBarChart, HoldingLineChart } from '@/src/capital/components/charts/AnalyticsCharts';
import { ManualProfitForm } from '@/src/capital/components/forms/ManualProfitForm';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { currentMonthKey, shiftMonth } from '@/src/capital/lib/dashboardRange';
import type { OverviewBundle } from '@/src/capital/services/overview';
import type { getAnalyticsBundle } from '@/src/capital/services/analytics';
import { cn } from '@/src/capital/lib/utils';

type DashboardInsights = Awaited<ReturnType<typeof getAnalyticsBundle>>;

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All' },
  { key: 'custom', label: 'Custom' },
] as const;

function Section({
  title,
  subtitle,
  children,
  action,
  emphasize,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  emphasize?: boolean;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            className={cn(
              'tracking-tight text-ac-text',
              emphasize ? 'text-base font-semibold' : 'text-sm font-semibold',
            )}
          >
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-xs text-ac-text-muted">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function PositionCard({
  label,
  valuePaise,
  valueText,
  accent,
}: {
  label: string;
  valuePaise?: number;
  valueText?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] px-4 py-5 shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ac-text-muted">
        {label}
      </p>
      <p
        className={cn(
          'mt-3 text-2xl font-semibold tracking-tight tabular-nums sm:text-[1.65rem]',
          accent && 'text-ac-accent',
        )}
      >
        {valueText ??
          (valuePaise != null ? <MoneyDisplay paise={valuePaise} className="text-2xl sm:text-[1.65rem]" /> : '—')}
      </p>
    </div>
  );
}

function AttentionGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-ac-text-secondary">{title}</p>
        <span className="rounded-full bg-ac-accent/15 px-2 py-0.5 text-[10px] font-semibold text-ac-accent">
          {count}
        </span>
      </div>
      <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/[0.08] bg-black/20">
        {children}
      </ul>
    </div>
  );
}

function AttentionRow({
  href,
  name,
  reason,
}: {
  href: string;
  name: string;
  reason: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm transition hover:bg-white/[0.04]"
      >
        <span className="truncate font-medium">{name}</span>
        <span className="shrink-0 text-xs text-ac-text-muted">{reason}</span>
      </Link>
    </li>
  );
}

export function OverviewDashboard({
  bundle,
  insights,
  customFrom,
  customTo,
  defaultPartnerPct = 50,
}: {
  bundle: OverviewBundle;
  insights: DashboardInsights;
  customFrom?: string;
  customTo?: string;
  defaultPartnerPct?: number;
}) {
  const router = useRouter();
  const [manualOpen, setManualOpen] = useState(false);
  const [from, setFrom] = useState(customFrom ?? '');
  const [to, setTo] = useState(customTo ?? '');

  const navigateRange = (key: string, opts?: { from?: string; to?: string; month?: string }) => {
    const params = new URLSearchParams();
    params.set('range', key);
    if (key === 'custom') {
      if (opts?.from) params.set('from', opts.from);
      if (opts?.to) params.set('to', opts.to);
    }
    if (key === 'month' && opts?.month) {
      params.set('month', opts.month);
    }
    router.push(`/dashboard?${params.toString()}`);
  };

  const monthCursor = bundle.range.month ?? currentMonthKey();
  const view = bundle.views.mine;
  const periodProfitLabel =
    bundle.range.key === 'month'
      ? 'This Month Profit'
      : `Period Profit (${bundle.range.label})`;

  const activeCapitalPaise = view.activeCapitalPaise ?? view.capitalAtRiskPaise;
  const pw = bundle.pendingWork;

  const purchasePending = useMemo(
    () => (pw?.justPurchased ?? []).filter((v) => v.purchasePending),
    [pw?.justPurchased],
  );
  const newlyPurchased = useMemo(
    () => (pw?.justPurchased ?? []).filter((v) => !v.purchasePending),
    [pw?.justPurchased],
  );

  const attentionTotal =
    (pw?.underRepair?.length ?? 0) +
    (pw?.readyForSale?.length ?? 0) +
    newlyPurchased.length +
    purchasePending.length +
    (pw?.openAdvances?.length ?? 0) +
    (pw?.pendingDocuments?.length ?? 0);

  const manufacturers = useMemo(() => {
    const rows = [...(insights.manufacturers ?? [])];
    rows.sort((a, b) => b.totalMySharePaise - a.totalMySharePaise);
    return rows;
  }, [insights.manufacturers]);
  const bestMfr = manufacturers[0] ?? null;
  const worstMfr =
    manufacturers.length > 1 ? manufacturers[manufacturers.length - 1] : null;

  const capitalDistribution =
    bundle.capitalDistribution?.length > 0
      ? bundle.capitalDistribution
      : view.allocation;

  return (
    <div className="mx-auto max-w-[1440px] space-y-10 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-ac-accent">
            Dealership Operating Console
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Morning Overview
          </h1>
          <p className="mt-1 text-sm text-ac-text-secondary">
            {bundle.range.label} · Position, attention, pace
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <div className="flex flex-wrap gap-1.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => {
                  if (r.key === 'custom') {
                    navigateRange('custom', { from: from || undefined, to: to || undefined });
                  } else if (r.key === 'month') {
                    navigateRange('month', { month: currentMonthKey() });
                  } else {
                    navigateRange(r.key);
                  }
                }}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                  bundle.range.key === r.key
                    ? 'bg-ac-accent/20 text-ac-accent ring-1 ring-ac-accent/40'
                    : 'bg-white/5 text-ac-text-secondary hover:bg-white/10 hover:text-ac-text',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          {bundle.range.key === 'month' ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">
              <button
                type="button"
                aria-label="Previous month"
                className="rounded-md p-1.5 text-ac-text-secondary transition hover:bg-white/10 hover:text-ac-text"
                onClick={() => navigateRange('month', { month: shiftMonth(monthCursor, -1) })}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[9.5rem] text-center text-sm font-medium tabular-nums">
                {bundle.range.label}
              </span>
              <button
                type="button"
                aria-label="Next month"
                className="rounded-md p-1.5 text-ac-text-secondary transition hover:bg-white/10 hover:text-ac-text"
                onClick={() => navigateRange('month', { month: shiftMonth(monthCursor, 1) })}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {bundle.range.key === 'custom' ? (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-[10px] uppercase text-ac-text-muted">From</label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-8 w-36"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase text-ac-text-muted">To</label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-8 w-36"
                />
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigateRange('custom', { from, to })}
              >
                Apply
              </Button>
            </div>
          ) : null}

          <Button variant="secondary" size="sm" onClick={() => setManualOpen(true)}>
            <Sparkles className="h-3.5 w-3.5" />
            Add Manual Profit
          </Button>
        </div>
      </div>

      {/* Section 1 — Current Position */}
      <Section title="Current Position" subtitle="Always-on snapshot of capital and results">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <PositionCard label="Active Capital" valuePaise={activeCapitalPaise} accent />
          <PositionCard label="Lifetime Profit (entitled)" valuePaise={view.profitPaise} accent />
          <PositionCard
            label={periodProfitLabel}
            valuePaise={bundle.isFuture ? undefined : view.periodProfitPaise}
            valueText={bundle.isFuture ? '—' : undefined}
          />
          <PositionCard
            label="ROI"
            valueText={view.roiBps != null ? `${(view.roiBps / 100).toFixed(1)}%` : '—'}
          />
          <PositionCard label="Vehicles In Stock" valueText={String(view.activeVehicles)} />
          <PositionCard label="Vehicles Sold" valueText={String(view.vehiclesSold)} />
        </div>
      </Section>

      {/* Section 2 — Attention Required */}
      <Section
        title="Attention Required"
        subtitle="Work that moves inventory and unlocks capital"
        emphasize
      >
        <div className="rounded-2xl border border-ac-accent/25 bg-ac-accent/[0.04] p-4 sm:p-5">
          {attentionTotal === 0 ? (
            <p className="py-8 text-center text-sm text-ac-text-secondary">
              Everything is up to date.
            </p>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              <AttentionGroup title="Waiting for repairs" count={pw?.underRepair?.length ?? 0}>
                {(pw?.underRepair ?? []).map((v) => (
                  <AttentionRow
                    key={v.id}
                    href={`/assets/${v.id}`}
                    name={v.displayName}
                    reason="Under repair"
                  />
                ))}
              </AttentionGroup>
              <AttentionGroup title="Ready to list" count={pw?.readyForSale?.length ?? 0}>
                {(pw?.readyForSale ?? []).map((v) => (
                  <AttentionRow
                    key={v.id}
                    href={`/assets/${v.id}`}
                    name={v.displayName}
                    reason="Ready for sale"
                  />
                ))}
              </AttentionGroup>
              <AttentionGroup title="Newly purchased needing work" count={newlyPurchased.length}>
                {newlyPurchased.map((v) => (
                  <AttentionRow
                    key={v.id}
                    href={`/assets/${v.id}`}
                    name={v.displayName}
                    reason="Just purchased"
                  />
                ))}
              </AttentionGroup>
              <AttentionGroup title="Purchase pending (seller payment)" count={purchasePending.length}>
                {purchasePending.map((v) => (
                  <AttentionRow
                    key={v.id}
                    href={`/assets/${v.id}?tab=activities`}
                    name={v.displayName}
                    reason="Purchase pending"
                  />
                ))}
              </AttentionGroup>
              <AttentionGroup
                title="Repair advances not settled"
                count={pw?.openAdvances?.length ?? 0}
              >
                {(pw?.openAdvances ?? []).map((a) => (
                  <AttentionRow
                    key={a.id}
                    href={`/assets/${a.assetId}?tab=activities`}
                    name={a.displayName}
                    reason="Advance open"
                  />
                ))}
              </AttentionGroup>
              <AttentionGroup
                title="Pending documents"
                count={pw?.pendingDocuments?.length ?? 0}
              >
                {(pw?.pendingDocuments ?? []).map((v) => (
                  <AttentionRow
                    key={v.id}
                    href={`/assets/${v.id}?tab=documents`}
                    name={v.displayName}
                    reason="No photos/docs"
                  />
                ))}
              </AttentionGroup>
            </div>
          )}
        </div>
      </Section>

      {/* Section 3 — Dealership Pace (exactly 3 charts) */}
      <Section title="Dealership Pace" subtitle="Three views — profit, buy/sell pressure, capital lock">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="ac-glass-card p-3 sm:p-4">
            <p className="mb-2 text-xs font-medium text-ac-text-secondary">Monthly Profit</p>
            {bundle.isFuture || view.monthlyProfit.length === 0 ? (
              <p className="flex h-64 items-center justify-center text-sm text-ac-text-muted">
                No profit data for this range.
              </p>
            ) : (
              <MonthlyProfitBars data={view.monthlyProfit} label="My Profit" />
            )}
          </div>
          <div className="ac-glass-card p-3 sm:p-4">
            <p className="mb-2 text-xs font-medium text-ac-text-secondary">
              Purchase Value vs Sale Value
            </p>
            {bundle.isFuture ? (
              <p className="flex h-64 items-center justify-center text-sm text-ac-text-muted">
                No data for future ranges.
              </p>
            ) : (
              <PurchasesVsSalesBars
                purchases={bundle.monthlyPurchases}
                sales={bundle.monthlySales}
              />
            )}
          </div>
          <div className="ac-glass-card p-3 sm:p-4">
            <p className="mb-2 text-xs font-medium text-ac-text-secondary">Capital Distribution</p>
            <CapitalAllocationDonut data={capitalDistribution} />
          </div>
        </div>
      </Section>

      {/* Section 4 — Business Insights */}
      <Section
        title="Business Insights"
        subtitle="Diagnostics that support decisions — no duplicate KPIs"
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          {bestMfr ? (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-ac-text-muted">
                Best manufacturer
              </p>
              <p className="mt-1 text-sm font-semibold">{bestMfr.manufacturer}</p>
              <p className="mt-0.5 text-xs text-ac-text-secondary">
                {(bestMfr.avgMyRoiBps / 100).toFixed(1)}% avg My ROI ·{' '}
                <MoneyDisplay paise={bestMfr.totalMySharePaise} className="text-xs" />
              </p>
            </div>
          ) : null}
          {worstMfr && worstMfr.manufacturer !== bestMfr?.manufacturer ? (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-ac-text-muted">
                Worst manufacturer
              </p>
              <p className="mt-1 text-sm font-semibold">{worstMfr.manufacturer}</p>
              <p className="mt-0.5 text-xs text-ac-text-secondary">
                {(worstMfr.avgMyRoiBps / 100).toFixed(1)}% avg My ROI ·{' '}
                <MoneyDisplay paise={worstMfr.totalMySharePaise} className="text-xs" />
              </p>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="ac-glass-card overflow-x-auto p-4">
            <p className="mb-3 text-xs font-medium text-ac-text-secondary">Profit by manufacturer</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-ac-text-muted">
                  <th className="pb-2 pr-3 font-medium">Brand</th>
                  <th className="pb-2 pr-3 font-medium">Deals</th>
                  <th className="pb-2 pr-3 font-medium">Avg My ROI</th>
                  <th className="pb-2 text-right font-medium">My Profit</th>
                </tr>
              </thead>
              <tbody>
                {manufacturers.slice(0, 8).map((m) => (
                  <tr key={m.manufacturer} className="border-b border-white/5">
                    <td className="py-2 pr-3 font-medium">{m.manufacturer}</td>
                    <td className="py-2 pr-3">{m.count}</td>
                    <td className="py-2 pr-3">{(m.avgMyRoiBps / 100).toFixed(1)}%</td>
                    <td className="py-2 text-right">
                      <MoneyDisplay paise={m.totalMySharePaise} />
                    </td>
                  </tr>
                ))}
                {manufacturers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-ac-text-muted">
                      No sold deals yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="space-y-4">
            <div className="ac-glass-card p-4">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="text-xs font-medium text-ac-text-secondary">Holding time</p>
                <p className="text-sm font-semibold tabular-nums">
                  {insights.insightKpis.averageHoldingDays} days avg
                </p>
              </div>
              <HoldingLineChart data={insights.holdingTime} />
            </div>
            <div className="ac-glass-card p-4">
              <p className="mb-2 text-xs font-medium text-ac-text-secondary">Inventory ageing</p>
              <CountBarChart data={insights.inventoryAgeing} label="Vehicles" />
            </div>
          </div>
        </div>
      </Section>

      {/* Section 5 — Recent Sales */}
      <Section title="Recent Sales" subtitle="Completed deals — not audit noise">
        <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 bg-white/[0.03] text-left text-ac-text-muted">
                <th className="px-4 py-3 font-medium">Vehicle</th>
                <th className="px-4 py-3 font-medium">Profit</th>
                <th className="px-4 py-3 font-medium">Sold Date</th>
                <th className="px-4 py-3 font-medium">Holding Days</th>
                <th className="px-4 py-3 font-medium text-right">ROI</th>
              </tr>
            </thead>
            <tbody>
              {(bundle.recentSales ?? []).map((sale) => (
                <tr key={sale.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/assets/${sale.id}`}
                      className="font-medium hover:text-ac-accent"
                    >
                      {sale.displayName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <MoneyDisplay paise={sale.mySharePaise} />
                  </td>
                  <td className="px-4 py-3 text-ac-text-secondary">{sale.saleDate}</td>
                  <td className="px-4 py-3 tabular-nums">{sale.holdingDays}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {sale.myRoiBps != null ? `${(sale.myRoiBps / 100).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
              {(bundle.recentSales ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ac-text-muted">
                    No recent sales.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Footer — Reports only */}
      <Link
        href="/reports"
        className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-ac-text-secondary transition hover:border-ac-accent/30 hover:text-ac-text"
      >
        <span>Reports — exports and historical summaries</span>
        <span className="text-ac-accent">Open →</span>
      </Link>

      <AnimatePresence>
        {manualOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="ac-glass-card relative max-h-[90vh] w-full max-w-lg overflow-y-auto p-6"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
            >
              <button
                type="button"
                className="absolute right-3 top-3 rounded-md p-1.5 text-ac-text-muted hover:bg-white/10"
                onClick={() => setManualOpen(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
              <h2 className="pr-8 text-lg font-semibold">Add Manual Profit</h2>
              <div className="mt-4">
                <ManualProfitForm
                  defaultPartnerPct={defaultPartnerPct}
                  onSuccess={() => {
                    setManualOpen(false);
                    router.refresh();
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
