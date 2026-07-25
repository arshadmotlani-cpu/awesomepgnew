'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Car, ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';
import { ProfitGrowthCombo } from '@/src/capital/components/charts/OverviewCharts';
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

function CompactKpi({
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
    <div
      className={cn(
        'rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3',
        accent && 'ring-1 ring-ac-accent/25',
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-ac-text-muted">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums sm:text-xl">
        {valueText ??
          (valuePaise != null ? (
            <MoneyDisplay paise={valuePaise} className="text-lg sm:text-xl" />
          ) : (
            '—'
          ))}
      </p>
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

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <CompactKpi label="Active Vehicles" valueText={String(view.activeVehicles)} />
        <CompactKpi label="Vehicles Sold" valueText={String(view.vehiclesSold)} />
        <CompactKpi label="Lifetime Profit" valuePaise={view.profitPaise} accent />
        <CompactKpi
          label={periodProfitLabel}
          valuePaise={bundle.isFuture ? undefined : view.periodProfitPaise}
          valueText={bundle.isFuture ? '—' : undefined}
        />
        <CompactKpi label="Avg Profit Per Vehicle" valuePaise={view.avgProfitPerVehiclePaise} />
        <CompactKpi
          label="ROI"
          valueText={view.roiBps != null ? `${(view.roiBps / 100).toFixed(1)}%` : '—'}
          accent
        />
      </section>

      <section className="ac-glass-card overflow-hidden">
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
