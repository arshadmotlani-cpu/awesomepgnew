'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Car, ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';
import {
  ProfitGrowthCombo,
  PurchasesVsSalesBars,
} from '@/src/capital/components/charts/OverviewCharts';
import { ManualProfitForm } from '@/src/capital/components/forms/ManualProfitForm';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { VEHICLE_ACTIVITY_TYPE_META, type VehicleActivityType } from '@/src/capital/lib/activityTypes';
import { currentMonthKey, shiftMonth } from '@/src/capital/lib/dashboardRange';
import { lifecycleLabel } from '@/src/capital/lib/vehicleLifecycle';
import type { OverviewBundle } from '@/src/capital/services/overview';
import { cn } from '@/src/capital/lib/utils';

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

function PendingQueue({
  title,
  href,
  empty,
  children,
  count,
  badge,
}: {
  title: string;
  href: string;
  empty: string;
  count: number;
  badge?: string;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="ac-glass-card flex min-h-[9rem] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ac-text-muted">
            {title}
          </h3>
          <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-200">
            {count}
          </span>
          {badge ? (
            <span className="rounded-md bg-ac-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-ac-warning">
              {badge}
            </span>
          ) : null}
        </div>
        <Link href={href} className="text-[11px] text-ac-accent hover:underline">
          Open
        </Link>
      </div>
      <ul className="flex-1 divide-y divide-white/[0.04]">{children}</ul>
      {count === 0 ? (
        <p className="px-3 py-4 text-xs text-ac-text-muted">{empty}</p>
      ) : null}
    </div>
  );
}

export function OverviewDashboard({
  bundle,
  customFrom,
  customTo,
  defaultPartnerPct = 50,
}: {
  bundle: OverviewBundle;
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
    bundle.range.key === 'month' ? 'Monthly Profit' : `Period Profit (${bundle.range.label})`;

  const inventoryTotal = view.activeVehicles + view.vehiclesSold;
  const activeCapitalPaise = view.activeCapitalPaise ?? view.capitalAtRiskPaise;
  const pending = bundle.pendingWork;

  const healthItems = useMemo(() => {
    const counts = bundle.vehicleStatusCounts;
    const underRepair = (counts?.repairing ?? 0) + (counts?.painting ?? 0);
    const items: { label: string; count: number; href: string }[] = [
      { label: 'Under Repair', count: underRepair, href: '/assets?tab=in_stock' },
      { label: 'Ready For Sale', count: counts?.ready ?? 0, href: '/assets?tab=in_stock' },
      { label: 'Listed', count: counts?.listed ?? 0, href: '/assets?tab=in_stock' },
      { label: 'Just Purchased', count: counts?.purchased ?? 0, href: '/assets?tab=in_stock' },
      {
        label: 'Open Repair Advances',
        count: bundle.openRepairAdvancesCount ?? 0,
        href: '/assets?tab=in_stock',
      },
    ];
    return items.filter((i) => i.count > 0);
  }, [bundle.vehicleStatusCounts, bundle.openRepairAdvancesCount]);

  const pendingTotal =
    (pending?.underRepair.length ?? 0) +
    (pending?.readyForSale.length ?? 0) +
    (pending?.justPurchased.length ?? 0) +
    (pending?.listed.length ?? 0) +
    (pending?.openAdvances.length ?? 0);

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
            {bundle.range.label} · What you own, what you made, what needs you next
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
            <Button variant="secondary" size="sm" asChild>
              <Link href="/assets/new">
                <Car className="h-3.5 w-3.5" />
                Add Vehicle
              </Link>
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setManualOpen(true)}>
              <Sparkles className="h-3.5 w-3.5" />
              Add Manual Profit
            </Button>
          </div>
        </div>
      </div>

      {/* Lifecycle state boards — operational hero */}
      <Section
        title="Where vehicles are now"
        subtitle={
          pendingTotal > 0
            ? `${pendingTotal} vehicles / advances across lifecycle stages`
            : 'Inventory clear — no open stages needing attention'
        }
        action={
          <Link href="/assets?tab=in_stock" className="text-xs text-ac-accent hover:underline">
            All in-stock vehicles
          </Link>
        }
      >
        {pendingTotal === 0 && (pending?.recentlySold?.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-5 text-sm text-emerald-100/90">
            No vehicles in Just Purchased / Under Repair / Ready / Listed, and no open repair advances.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <PendingQueue
              title="Just Purchased"
              href="/assets?tab=in_stock&status=purchased"
              empty="None"
              count={pending?.justPurchased.length ?? 0}
              badge={
                (pending?.purchasePendingCount ?? 0) > 0
                  ? `${pending?.purchasePendingCount} Purchase Pending`
                  : undefined
              }
            >
              {(pending?.justPurchased ?? []).map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/assets/${v.id}?tab=overview`}
                    className="block px-3 py-2 text-sm transition hover:bg-white/[0.04]"
                  >
                    <span className="font-medium">{v.displayName}</span>
                    <span className="mt-0.5 block text-[11px] text-ac-text-muted">
                      {'purchasePending' in v && v.purchasePending
                        ? 'Purchase Pending'
                        : 'Just Purchased'}
                    </span>
                  </Link>
                </li>
              ))}
            </PendingQueue>

            <PendingQueue
              title="Under Repair"
              href="/assets?tab=in_stock"
              empty="None"
              count={pending?.underRepair.length ?? 0}
            >
              {(pending?.underRepair ?? []).map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/assets/${v.id}?tab=overview`}
                    className="block px-3 py-2 text-sm transition hover:bg-white/[0.04]"
                  >
                    <span className="font-medium">{v.displayName}</span>
                    <span className="mt-0.5 block text-[11px] text-ac-text-muted">
                      {lifecycleLabel(v.status)}
                    </span>
                  </Link>
                </li>
              ))}
            </PendingQueue>

            <PendingQueue
              title="Open Repair Advances"
              href="/assets?tab=in_stock"
              empty="None"
              count={pending?.openAdvances.length ?? 0}
            >
              {(pending?.openAdvances ?? []).map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/assets/${a.assetId}?tab=activities`}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm transition hover:bg-white/[0.04]"
                  >
                    <span className="min-w-0 truncate font-medium">{a.displayName}</span>
                    <MoneyDisplay paise={a.advancePaise} className="shrink-0 text-xs" />
                  </Link>
                </li>
              ))}
            </PendingQueue>

            <PendingQueue
              title="Ready For Sale"
              href="/assets?tab=in_stock&status=ready"
              empty="None"
              count={pending?.readyForSale.length ?? 0}
            >
              {(pending?.readyForSale ?? []).map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/assets/${v.id}?tab=sale`}
                    className="block px-3 py-2 text-sm transition hover:bg-white/[0.04]"
                  >
                    <span className="font-medium">{v.displayName}</span>
                    <span className="mt-0.5 block text-[11px] text-ac-text-muted">List or sell</span>
                  </Link>
                </li>
              ))}
            </PendingQueue>

            <PendingQueue
              title="Listed For Sale"
              href="/assets?tab=in_stock&status=listed"
              empty="None"
              count={pending?.listed.length ?? 0}
            >
              {(pending?.listed ?? []).map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/assets/${v.id}?tab=sale`}
                    className="block px-3 py-2 text-sm transition hover:bg-white/[0.04]"
                  >
                    <span className="font-medium">{v.displayName}</span>
                    <span className="mt-0.5 block text-[11px] text-ac-text-muted">
                      Waiting for buyer
                    </span>
                  </Link>
                </li>
              ))}
            </PendingQueue>

            {(pending?.recentlySold?.length ?? 0) > 0 ? (
              <PendingQueue
                title="Recently Sold"
                href="/assets?tab=sold"
                empty="None"
                count={pending?.recentlySold.length ?? 0}
              >
                {(pending?.recentlySold ?? []).map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/assets/${v.id}?tab=sale`}
                      className="block px-3 py-2 text-sm transition hover:bg-white/[0.04]"
                    >
                      <span className="font-medium">{v.displayName}</span>
                      <span className="mt-0.5 block text-[11px] text-ac-text-muted">
                        {v.saleDate ? `Sold ${v.saleDate}` : 'Sold'}
                      </span>
                    </Link>
                  </li>
                ))}
              </PendingQueue>
            ) : null}
          </div>
        )}
      </Section>

      {/* Financial Overview — below operational state boards */}
      <Section title="Financial Overview" subtitle="Inventory, capital, profit, and performance at a glance">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ac-text-muted">
              Inventory
            </p>
            <div className="mt-3 space-y-2.5">
              <MetricRow label="In Stock" valueText={String(view.activeVehicles)} />
              <MetricRow label="Sold" valueText={String(view.vehiclesSold)} />
              <MetricRow label="Total Vehicles" valueText={String(inventoryTotal)} accent />
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ac-text-muted">
              Active Capital
            </p>
            <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
              <MoneyDisplay paise={activeCapitalPaise} className="text-2xl" />
            </p>
            <p className="mt-1 text-xs text-ac-text-muted">Your money in in-stock vehicles</p>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ac-text-muted">
              Profit
            </p>
            <div className="mt-3 space-y-2.5">
              <MetricRow label="Lifetime Profit" valuePaise={view.profitPaise} accent />
              <MetricRow
                label={periodProfitLabel}
                valuePaise={bundle.isFuture ? undefined : view.periodProfitPaise}
                valueText={bundle.isFuture ? '—' : undefined}
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ac-text-muted">
              Performance
            </p>
            <div className="mt-3 space-y-2.5">
              <MetricRow
                label="My ROI"
                valueText={view.roiBps != null ? `${(view.roiBps / 100).toFixed(1)}%` : '—'}
                accent
              />
              <MetricRow
                label="Avg Profit Per Vehicle"
                valuePaise={view.avgProfitPerVehiclePaise}
              />
            </div>
            <p className="mt-2 text-[10px] text-ac-text-muted">
              ROI = My Lifetime Profit ÷ My Capital Stakes
            </p>
          </div>
        </div>
      </Section>

      {/* Business Health summary */}
      {healthItems.length > 0 ? (
        <Section title="Business Health" subtitle="Operational counts with pending items only">
          <div className="flex flex-wrap gap-2">
            {healthItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-sm transition hover:bg-amber-500/10"
              >
                <span className="text-ac-text-secondary">{item.label}</span>
                <span className="font-semibold tabular-nums">{item.count}</span>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Activity + charts */}
      <Section title="Pulse" subtitle="What happened recently and whether the business is growing">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="ac-glass-card overflow-hidden">
            <div className="border-b border-white/[0.06] px-4 py-3">
              <h3 className="text-sm font-semibold">Recent Activity</h3>
              <p className="mt-0.5 text-xs text-ac-text-muted">Daily dealership log</p>
            </div>
            <div className="max-h-[28rem] overflow-y-auto">
              {activityFeed.length === 0 ? (
                <div className="flex h-40 items-center justify-center px-4 text-sm text-ac-text-muted">
                  No recent activity.
                </div>
              ) : (
                <ul className="divide-y divide-white/[0.05]">
                  {activityFeed.map((row) => {
                    const label = activityLabel(row.action, row.afterState);
                    const href =
                      row.entityType === 'asset' && row.entityId
                        ? `/assets/${row.entityId}`
                        : null;
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
                          <Link
                            href={href}
                            className="block px-4 py-2.5 transition hover:bg-white/[0.04]"
                          >
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
          </div>

          <div className="ac-glass-card overflow-hidden">
            <div className="border-b border-white/[0.06] px-4 py-3">
              <h3 className="text-sm font-semibold">Profit Growth</h3>
              <p className="mt-0.5 text-xs text-ac-text-muted">
                Monthly profit bars + cumulative line — best fit for a single monthly series (not
                OHLC / candlesticks)
              </p>
            </div>
            <div className="p-3 sm:p-4">
              {bundle.isFuture || view.monthlyProfit.length === 0 ? (
                <div className="flex h-56 items-center justify-center text-sm text-ac-text-muted">
                  No profit history yet.
                </div>
              ) : (
                <ProfitGrowthCombo
                  monthly={view.monthlyProfit}
                  cumulative={view.portfolioGrowth}
                />
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Purchases vs Sales"
        subtitle="Dealership throughput: capital deployed into stock versus sale proceeds by month"
      >
        <div className="ac-glass-card overflow-hidden p-3 sm:p-4">
          {bundle.isFuture ||
          ((bundle.monthlyPurchases?.length ?? 0) === 0 &&
            (bundle.monthlySales?.length ?? 0) === 0) ? (
            <div className="flex h-56 items-center justify-center text-sm text-ac-text-muted">
              No purchase or sale history yet.
            </div>
          ) : (
            <PurchasesVsSalesBars
              purchases={bundle.monthlyPurchases ?? []}
              sales={bundle.monthlySales ?? []}
            />
          )}
        </div>
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
