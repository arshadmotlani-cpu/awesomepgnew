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
import { currentMonthKey, shiftMonth } from '@/src/capital/lib/dashboardRange';
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
  asset_status_changed: 'Status Changed',
  asset_sold: 'Sold',
  sale_recorded: 'Sold',
  payment_created: 'Payment Recorded',
  payment_updated: 'Payment Updated',
  expense_created: 'Expense Recorded',
  settlement_created: 'Settlement Created',
  manual_profit_added: 'Manual Profit',
  vehicle_activity_created: 'Activity Recorded',
  repair_advance_created: 'Repair Advance',
  repair_advance_settled: 'Repair Advance Settled',
  capital_injected: 'Capital Injected',
  capital_withdrawn: 'Capital Withdrawn',
  document_uploaded: 'Document Uploaded',
  settings_updated: 'Settings Updated',
};

function activityLabel(action: string) {
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

function GroupCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex h-full flex-col rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 sm:p-4',
        className,
      )}
    >
      <h2 className="text-[10px] font-medium uppercase tracking-[0.14em] text-ac-text-muted">
        {title}
      </h2>
      <div className="mt-3 flex flex-1 flex-col justify-center gap-2.5">{children}</div>
    </section>
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

  const healthItems = useMemo(() => {
    const counts = bundle.vehicleStatusCounts;
    const underRepair = (counts?.repairing ?? 0) + (counts?.painting ?? 0);
    const items: { label: string; count: number }[] = [
      { label: 'Under Repair', count: underRepair },
      { label: 'Ready For Sale', count: counts?.ready ?? 0 },
      { label: 'Listed', count: counts?.listed ?? 0 },
      { label: 'Just Purchased', count: counts?.purchased ?? 0 },
      { label: 'Open Repair Advances', count: bundle.openRepairAdvancesCount ?? 0 },
    ];
    return items.filter((i) => i.count > 0);
  }, [bundle.vehicleStatusCounts, bundle.openRepairAdvancesCount]);

  const activityFeed = useMemo(() => {
    const rows = bundle.timeline?.length ? bundle.timeline : bundle.activity ?? [];
    return rows.slice(0, 20);
  }, [bundle.timeline, bundle.activity]);

  const quickActions = useMemo(
    () => [
      { href: '/assets/new', label: 'Add Vehicle', icon: Car },
      {
        href: '#manual-profit',
        label: 'Add Manual Profit',
        icon: Sparkles,
        onClick: () => setManualOpen(true),
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 pb-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-ac-accent">
            Automotive Capital
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-ac-text-secondary">{bundle.range.label}</p>
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
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {quickActions.map((a) => {
          const Icon = a.icon;
          if (a.onClick) {
            return (
              <Button key={a.label} variant="secondary" size="sm" onClick={a.onClick}>
                <Icon className="h-3.5 w-3.5" />
                {a.label}
              </Button>
            );
          }
          return (
            <Button key={a.label} variant="secondary" size="sm" asChild>
              <Link href={a.href}>
                <Icon className="h-3.5 w-3.5" />
                {a.label}
              </Link>
            </Button>
          );
        })}
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <GroupCard title="Inventory">
          <MetricRow label="In Stock" valueText={String(view.activeVehicles)} />
          <MetricRow label="Sold" valueText={String(view.vehiclesSold)} />
          <MetricRow label="Total Vehicles" valueText={String(inventoryTotal)} accent />
        </GroupCard>

        <GroupCard title="Active Capital">
          <div>
            <p className="text-xs text-ac-text-muted">My money in in-stock vehicles</p>
            <p className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
              <MoneyDisplay paise={activeCapitalPaise} className="text-xl sm:text-2xl" />
            </p>
          </div>
        </GroupCard>

        <GroupCard title="Profit">
          <MetricRow label="Lifetime Profit" valuePaise={view.profitPaise} accent />
          <MetricRow
            label={periodProfitLabel}
            valuePaise={bundle.isFuture ? undefined : view.periodProfitPaise}
            valueText={bundle.isFuture ? '—' : undefined}
          />
        </GroupCard>

        <GroupCard title="Performance">
          <MetricRow
            label="ROI"
            valueText={view.roiBps != null ? `${(view.roiBps / 100).toFixed(1)}%` : '—'}
            accent
          />
          <MetricRow label="Avg Profit Per Vehicle" valuePaise={view.avgProfitPerVehiclePaise} />
        </GroupCard>
      </section>

      {healthItems.length > 0 ? (
        <section className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3 sm:p-4">
          <h2 className="text-[10px] font-medium uppercase tracking-[0.14em] text-amber-200/80">
            Business Health
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {healthItems.map((item) => (
              <Link
                key={item.label}
                href="/assets?tab=in_stock"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm transition hover:border-amber-400/30 hover:bg-white/[0.07]"
              >
                <span className="text-ac-text-secondary">{item.label}</span>
                <span className="font-semibold tabular-nums text-ac-text">{item.count}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="ac-glass-card overflow-hidden">
          <div className="border-b border-white/[0.06] px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold tracking-tight">Recent Activity</h2>
            <p className="mt-0.5 text-xs text-ac-text-muted">Latest dealership events</p>
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            {activityFeed.length === 0 ? (
              <div className="flex h-40 items-center justify-center px-4 text-sm text-ac-text-muted">
                No recent activity.
              </div>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {activityFeed.map((row) => {
                  const label = activityLabel(row.action);
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
                          className="block px-4 py-2.5 transition hover:bg-white/[0.04] sm:px-5"
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div className="px-4 py-2.5 sm:px-5">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="ac-glass-card overflow-hidden">
            <div className="border-b border-white/[0.06] px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold tracking-tight">Profit Growth</h2>
              <p className="mt-0.5 text-xs text-ac-text-muted">
                Monthly profit (bars) with cumulative total (line)
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
      </section>

      <section className="ac-glass-card overflow-hidden">
        <div className="border-b border-white/[0.06] px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold tracking-tight">Purchases vs Sales</h2>
          <p className="mt-0.5 text-xs text-ac-text-muted">
            Monthly purchase volume against sale proceeds
          </p>
        </div>
        <div className="p-3 sm:p-4">
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
      </section>

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
