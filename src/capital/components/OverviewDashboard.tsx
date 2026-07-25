'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';
import {
  ProfitGrowthCombo,
} from '@/src/capital/components/charts/OverviewCharts';
import {
  AcquisitionChart,
  CashFlowChart,
  CountBarChart,
  HoldingLineChart,
  RoiLineChart,
  ValueBarChart,
} from '@/src/capital/components/charts/AnalyticsCharts';
import { ManualProfitForm } from '@/src/capital/components/forms/ManualProfitForm';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { VEHICLE_ACTIVITY_TYPE_META, type VehicleActivityType } from '@/src/capital/lib/activityTypes';
import { currentMonthKey, shiftMonth } from '@/src/capital/lib/dashboardRange';
import type { OverviewBundle } from '@/src/capital/services/overview';
import type { getAnalyticsBundle } from '@/src/capital/services/analytics';
import { cn } from '@/src/capital/lib/utils';

type DashboardInsights = Awaited<ReturnType<typeof getAnalyticsBundle>>;

const FUEL_LABELS: Record<string, string> = {
  petrol: 'Petrol',
  diesel: 'Diesel',
  cng: 'CNG',
  ev: 'EV',
  hybrid: 'Hybrid',
  unknown: 'Unknown',
};

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All' },
  { key: 'custom', label: 'Custom' },
] as const;

const ACTIVITY_LABELS: Record<string, string> = {
  asset_created: 'Vehicle Created',
  asset_updated: 'Vehicle Updated',
  asset_details_updated: 'Vehicle Updated',
  asset_status_changed: 'Status Changed',
  asset_sold: 'Vehicle Sold',
  sale_recorded: 'Vehicle Sold',
  payment_created: 'Payment Recorded',
  manual_profit_added: 'Profit Recorded',
  vehicle_activity_created: 'Purchase Activity',
  vehicle_activity_updated: 'Activity Updated',
  vehicle_activity_reversed: 'Activity Reversed',
  repair_advance_created: 'Repair Advance Given',
  repair_advance_settled: 'Repair Settled',
  capital_injected: 'Capital Injected',
  capital_withdrawn: 'Capital Withdrawn',
  document_uploaded: 'Document Uploaded',
  investor_added: 'Investor Added',
};

function activityLabel(action: string, afterState?: unknown) {
  if (action === 'vehicle_activity_created' && afterState && typeof afterState === 'object') {
    const type = (afterState as { activityType?: string }).activityType;
    if (type && type in VEHICLE_ACTIVITY_TYPE_META) {
      return VEHICLE_ACTIVITY_TYPE_META[type as VehicleActivityType].label;
    }
  }
  if (ACTIVITY_LABELS[action]) return ACTIVITY_LABELS[action];
  return action
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatActivityTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Section({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-ac-text">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-ac-text-muted">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MetricRow({
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
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-ac-text-muted">{label}</span>
      <span
        className={cn(
          'text-sm font-semibold tabular-nums tracking-tight',
          accent && 'text-ac-accent',
        )}
      >
        {valueText ??
          (valuePaise != null ? <MoneyDisplay paise={valuePaise} className="text-sm" /> : '—')}
      </span>
    </div>
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
      ? 'My Monthly Profit'
      : `My Period Profit (${bundle.range.label})`;

  const inventoryTotal = view.activeVehicles + view.vehiclesSold;
  const activeCapitalPaise = view.activeCapitalPaise ?? view.capitalAtRiskPaise;

  const activityFeed = useMemo(() => {
    const rows = bundle.timeline?.length ? bundle.timeline : (bundle.activity ?? []);
    return rows.slice(0, 20);
  }, [bundle.timeline, bundle.activity]);

  return (
    <div className="mx-auto max-w-[1440px] space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-ac-accent">
            Dealership Command Center
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Morning Overview
          </h1>
          <p className="mt-1 text-sm text-ac-text-secondary">
            {bundle.range.label} · Executive summary of your capital and results
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

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setManualOpen(true)}>
              <Sparkles className="h-3.5 w-3.5" />
              Add Manual Profit
            </Button>
          </div>
        </div>
      </div>

      {/* Financial Overview — period money movement (not duplicated below) */}
      <Section
        title="Financial Overview"
        subtitle={`${bundle.period.label} · purchases, recoveries, and period ROI`}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-[10px] text-ac-text-muted">Vehicles purchased</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {bundle.period.vehiclesPurchased}
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-[10px] text-ac-text-muted">Vehicles sold</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{bundle.period.vehiclesSold}</p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-[10px] text-ac-text-muted">Money invested</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              <MoneyDisplay paise={bundle.period.moneyInvestedPaise} className="text-xl" />
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-[10px] text-ac-text-muted">Capital recovered</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              <MoneyDisplay paise={bundle.period.capitalRecoveredPaise} className="text-xl" />
            </p>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <MetricRow
            label="My Period ROI"
            valueText={
              bundle.isFuture || view.periodRoiBps == null
                ? '—'
                : `${(view.periodRoiBps / 100).toFixed(1)}%`
            }
            accent
          />
          <p className="mt-2 text-[10px] text-ac-text-muted">
            Period ROI uses My profit ÷ My capital for {bundle.period.label}. Lifetime ROI is under
            Performance.
          </p>
        </div>
      </Section>

      {/* Inventory Summary */}
      <Section title="Inventory Summary" subtitle="Counts only — open Vehicles to manage stock">
        <Link
          href="/assets"
          className="group block rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 transition hover:border-ac-accent/40 hover:bg-white/[0.05]"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              <MetricRow label="In Stock" valueText={String(view.activeVehicles)} />
              <MetricRow label="Sold" valueText={String(view.vehiclesSold)} />
              <MetricRow label="Total Vehicles" valueText={String(inventoryTotal)} accent />
            </div>
            <span className="text-xs text-ac-accent">Open Vehicles →</span>
          </div>
        </Link>
      </Section>

      {/* Capital Summary */}
      <Section title="Capital Summary" subtitle="Your money currently in inventory">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            <MoneyDisplay paise={activeCapitalPaise} className="text-2xl" />
          </p>
          <p className="mt-1 text-xs text-ac-text-muted">Active capital in in-stock vehicles</p>
        </div>
      </Section>

      {/* Profit Summary */}
      <Section title="Profit Summary" subtitle="My realised profit only">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="space-y-2.5">
            <MetricRow label="My Lifetime Profit" valuePaise={view.profitPaise} accent />
            <MetricRow
              label={periodProfitLabel}
              valuePaise={bundle.isFuture ? undefined : view.periodProfitPaise}
              valueText={bundle.isFuture ? '—' : undefined}
            />
          </div>
          <p className="mt-2 text-[10px] text-ac-text-muted">
            Realised profit attributable to me during the selected period.
          </p>
        </div>
      </Section>

      {/* Performance */}
      <Section title="Performance" subtitle="Portfolio My ROI">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="space-y-2.5">
            <MetricRow
              label="My ROI"
              valueText={view.roiBps != null ? `${(view.roiBps / 100).toFixed(1)}%` : '—'}
              accent
            />
            <MetricRow label="Avg Profit Per Vehicle" valuePaise={view.avgProfitPerVehiclePaise} />
          </div>
          <p className="mt-2 text-[10px] text-ac-text-muted">
            ROI = My Lifetime Profit ÷ My Capital Stakes
          </p>
        </div>
      </Section>

      {/* Cash Flow */}
      <Section title="Cash Flow" subtitle="Payments received vs capital invested">
        <div className="ac-glass-card p-3 sm:p-4">
          <CashFlowChart data={insights.cashFlow} />
        </div>
      </Section>

      {/* Manufacturer Performance */}
      <Section title="Manufacturer Performance" subtitle="My profit and My ROI by brand">
        <div className="ac-glass-card overflow-x-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-ac-text-muted">
                <th className="pb-3 pr-4 font-medium">Manufacturer</th>
                <th className="pb-3 pr-4 font-medium">Deals</th>
                <th className="pb-3 pr-4 font-medium">Avg My ROI</th>
                <th className="pb-3 font-medium text-right">My Profit</th>
              </tr>
            </thead>
            <tbody>
              {insights.manufacturers.slice(0, 8).map((m) => (
                <tr key={m.manufacturer} className="border-b border-white/5">
                  <td className="py-2.5 pr-4 font-medium">{m.manufacturer}</td>
                  <td className="py-2.5 pr-4">{m.count}</td>
                  <td className="py-2.5 pr-4">{(m.avgMyRoiBps / 100).toFixed(1)}%</td>
                  <td className="py-2.5 text-right">
                    <MoneyDisplay paise={m.totalMySharePaise} />
                  </td>
                </tr>
              ))}
              {insights.manufacturers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-ac-text-muted">
                    No sold deals yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Holding Time */}
      <Section title="Holding Time" subtitle="How long capital stays locked before sale">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-xs text-ac-text-muted">Avg holding (sold)</p>
            <p className="mt-1 text-2xl font-semibold">
              {insights.insightKpis.averageHoldingDays} days
            </p>
          </div>
          <div className="ac-glass-card p-3 sm:p-4">
            <HoldingLineChart data={insights.holdingTime} />
          </div>
        </div>
      </Section>

      {/* Monthly Growth */}
      <Section title="Monthly Growth" subtitle="My monthly profit bars + cumulative line">
        <div className="ac-glass-card overflow-hidden p-3 sm:p-4">
          {bundle.isFuture || view.monthlyProfit.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-sm text-ac-text-muted">
              No profit history yet.
            </div>
          ) : (
            <ProfitGrowthCombo monthly={view.monthlyProfit} cumulative={view.portfolioGrowth} />
          )}
        </div>
      </Section>

      {/* Recent Activity */}
      <Section title="Recent Activity" subtitle="Daily dealership log">
        <div className="ac-glass-card max-h-[22rem] overflow-y-auto">
          {activityFeed.length === 0 ? (
            <div className="flex h-32 items-center justify-center px-4 text-sm text-ac-text-muted">
              No recent activity.
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {activityFeed.map((row) => {
                const label = activityLabel(row.action, row.afterState);
                const href =
                  row.entityType === 'asset' && row.entityId ? `/assets/${row.entityId}` : null;
                const inner = (
                  <>
                    <span className="text-sm font-medium text-ac-text">{label}</span>
                    <span className="mt-0.5 block text-[11px] text-ac-text-muted">
                      {formatActivityTime(row.createdAt)}
                    </span>
                  </>
                );
                return (
                  <li key={row.id}>
                    {href ? (
                      <Link href={href} className="block px-4 py-2.5 transition hover:bg-white/[0.04]">
                        {inner}
                      </Link>
                    ) : (
                      <div className="px-4 py-2.5">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Section>

      {/* Business Insights */}
      <Section
        title="Business Insights"
        subtitle="Deep My-only diagnostics — inventory ageing, acquisition, repairs, ROI trend"
      >
        <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
            <p className="text-[10px] text-ac-text-muted">Avg My ROI (per deal)</p>
            <p className="mt-1 text-lg font-semibold">
              {(insights.insightKpis.averageMyRoiBps / 100).toFixed(1)}%
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
            <p className="text-[10px] text-ac-text-muted">Stale inventory (90+ days)</p>
            <p className="mt-1 text-lg font-semibold">{insights.insightKpis.staleInventoryCount}</p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
            <p className="text-[10px] text-ac-text-muted">Repair on active</p>
            <p className="mt-1 text-lg font-semibold">
              <MoneyDisplay
                paise={insights.insightKpis.repairSpendOnActivePaise}
                className="text-lg"
              />
            </p>
          </div>
        </div>
        <div className="mb-3 ac-glass-card p-3">
          <p className="mb-2 text-xs font-medium text-ac-text-secondary">My ROI trend by sale month</p>
          <RoiLineChart data={insights.roiTrend} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="ac-glass-card p-3">
            <p className="mb-2 text-xs font-medium text-ac-text-secondary">Inventory ageing</p>
            <CountBarChart data={insights.inventoryAgeing} label="Vehicles" />
          </div>
          <div className="ac-glass-card p-3">
            <p className="mb-2 text-xs font-medium text-ac-text-secondary">Acquisition trends</p>
            <AcquisitionChart data={insights.acquisition} />
          </div>
          <div className="ac-glass-card p-3">
            <p className="mb-2 text-xs font-medium text-ac-text-secondary">Repair trends</p>
            <ValueBarChart data={insights.repairTrends} label="Repairs" />
          </div>
          <div className="ac-glass-card p-3">
            <p className="mb-2 text-xs font-medium text-ac-text-secondary">Profit distribution</p>
            <CountBarChart data={insights.profitDistribution} label="Deals" />
          </div>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="ac-glass-card overflow-x-auto p-4">
            <p className="mb-2 text-xs font-medium text-ac-text-secondary">Fuel type (My profit)</p>
            <table className="w-full text-sm">
              <tbody>
                {insights.fuelPerformance.map((f) => (
                  <tr key={f.fuelType} className="border-b border-white/5">
                    <td className="py-2 pr-3">{FUEL_LABELS[f.fuelType] ?? f.fuelType}</td>
                    <td className="py-2 pr-3 text-ac-text-muted">{f.count}</td>
                    <td className="py-2 pr-3">{(f.avgMyRoiBps / 100).toFixed(1)}%</td>
                    <td className="py-2 text-right">
                      <MoneyDisplay paise={f.totalMySharePaise} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ac-glass-card overflow-x-auto p-4">
            <p className="mb-2 text-xs font-medium text-ac-text-secondary">Best vehicles (My profit)</p>
            <ul className="divide-y divide-white/5">
              {insights.vehiclePerformance.best.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/assets/${r.id}`}
                    className="flex justify-between gap-2 py-2 text-sm hover:text-ac-accent"
                  >
                    <span className="truncate">{r.displayName}</span>
                    <MoneyDisplay paise={r.mySharePaise ?? 0} className="shrink-0 text-sm" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* Reports Shortcut */}
      <Section title="Reports Shortcut" subtitle="Exports, historical summaries, and accounting">
        <Link
          href="/reports"
          className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-4 text-sm transition hover:border-ac-accent/40"
        >
          <span>
            Open Reports for printable summaries and CSV/XLSX exports.
          </span>
          <span className="text-ac-accent">Go to Reports →</span>
        </Link>
      </Section>

      <AnimatePresence>
        {manualOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12 }}
              className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-ac-elevated p-5 shadow-2xl"
            >
              <button
                type="button"
                aria-label="Close"
                className="absolute right-3 top-3 rounded-md p-1.5 text-ac-text-muted hover:bg-white/10 hover:text-ac-text"
                onClick={() => setManualOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
              <h2 className="pr-8 text-lg font-semibold">Add Manual Profit</h2>
              <p className="mt-1 text-sm text-ac-text-secondary">
                Non-vehicle profit that still counts toward your lifetime figures.
              </p>
              <div className="mt-4">
                <ManualProfitForm
                  defaultPartnerPct={defaultPartnerPct}
                  onSuccess={() => setManualOpen(false)}
                />
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
