'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Car,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  HandCoins,
  Plus,
  Receipt,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import {
  CapitalAllocationDonut,
  InvestmentWaterfall,
  MonthlyProfitBars,
  PortfolioGrowthArea,
} from '@/src/capital/components/charts/OverviewCharts';
import { ManualProfitForm } from '@/src/capital/components/forms/ManualProfitForm';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Button } from '@/src/capital/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { Input } from '@/src/capital/components/ui/input';
import {
  currentMonthKey,
  shiftMonth,
} from '@/src/capital/lib/dashboardRange';
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
  asset_created: 'Vehicle Purchased',
  asset_status_changed: 'Status Updated',
  expense_created: 'Expense Added',
  expense_reversed: 'Expense Reversed',
  payment_created: 'Profit Received',
  payment_reversed: 'Payment Reversed',
  capital_invested: 'Capital Deployed',
  capital_reversed: 'Capital Reversed',
  manual_profit_added: 'Manual Profit',
  settlement_created: 'Settlement',
  document_uploaded: 'Document Uploaded',
};

function activityTitle(action: string, afterState: unknown): string {
  if (action === 'asset_status_changed' && afterState && typeof afterState === 'object') {
    const status = (afterState as { status?: string }).status;
    if (status === 'sold' || status === 'settled') return 'Vehicle Sold';
    if (status === 'repairing' || status === 'painting') return 'In Repair';
    if (status === 'listed') return 'Vehicle Listed';
  }
  if (action === 'expense_created' && afterState && typeof afterState === 'object') {
    const cat = (afterState as { category?: string }).category;
    if (cat && /repair/i.test(cat)) return 'Repair Added';
  }
  return ACTIVITY_LABELS[action] ?? action.replace(/_/g, ' ');
}

type SideKpi = {
  label: string;
  valuePaise?: number;
  valueText?: string;
  kind: 'paise' | 'text';
  trend?: 'up' | 'down' | 'neutral';
};

function SideKpiStack({ items }: { items: SideKpi[] }) {
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      {items.map((kpi, i) => (
        <motion.div
          key={kpi.label}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.05 * i, duration: 0.35 }}
          className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 transition-colors hover:border-ac-accent/25 hover:bg-white/[0.05]"
        >
          <p className="text-[11px] font-medium uppercase tracking-wider text-ac-text-muted">
            {kpi.label}
          </p>
          <p
            className={cn(
              'mt-1 text-xl font-semibold tracking-tight',
              kpi.trend === 'up' && 'text-ac-success',
              kpi.trend === 'down' && 'text-ac-danger',
            )}
          >
            {kpi.kind === 'paise' && kpi.valuePaise != null ? (
              <MoneyDisplay paise={kpi.valuePaise} className="text-xl" />
            ) : (
              (kpi.valueText ?? '—')
            )}
          </p>
        </motion.div>
      ))}
    </div>
  );
}

function AnalyticRow({
  title,
  subtitle,
  chart,
  kpis,
  empty,
}: {
  title: string;
  subtitle?: string;
  chart: React.ReactNode;
  kpis: SideKpi[];
  empty?: boolean;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45 }}
      className="ac-glass-card overflow-hidden"
    >
      <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-ac-text-muted">{subtitle}</p> : null}
      </div>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.85fr)_minmax(240px,1fr)]">
        <div className="border-b border-white/[0.06] p-4 sm:p-5 lg:border-b-0 lg:border-r">
          {empty ? (
            <div className="flex h-64 items-center justify-center text-sm text-ac-text-muted">
              No data available for this period.
            </div>
          ) : (
            chart
          )}
        </div>
        <div className="p-4 sm:p-5">
          {empty ? (
            <div className="flex h-full min-h-48 items-center justify-center text-sm text-ac-text-muted">
              No data.
            </div>
          ) : (
            <SideKpiStack items={kpis} />
          )}
        </div>
      </div>
    </motion.section>
  );
}

function HeroMetric({
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
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      className={cn(
        'ac-kpi-card rounded-2xl border border-white/[0.08] p-5 transition-shadow duration-300 hover:shadow-[0_16px_48px_rgba(0,0,0,0.35)]',
        accent && 'ring-1 ring-ac-accent/30',
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ac-text-muted">
        {label}
      </p>
      <div className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        {valueText ??
          (valuePaise != null ? <MoneyDisplay paise={valuePaise} className="text-2xl sm:text-3xl" /> : '—')}
      </div>
    </motion.div>
  );
}

function StatTile({
  label,
  valuePaise,
  valueText,
}: {
  label: string;
  valuePaise?: number;
  valueText?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-4 transition-colors hover:border-white/12">
      <p className="text-[11px] uppercase tracking-wider text-ac-text-muted">{label}</p>
      <p className="mt-1.5 text-lg font-semibold">
        {valueText ??
          (valuePaise != null ? <MoneyDisplay paise={valuePaise} className="text-lg" /> : '—')}
      </p>
    </div>
  );
}

export function OverviewDashboard({
  bundle,
  customFrom,
  customTo,
}: {
  bundle: OverviewBundle;
  customFrom?: string;
  customTo?: string;
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

  const quickActions = useMemo(
    () => [
      { href: '/assets/new', label: 'Add Vehicle', icon: Car },
      { href: '/expenses', label: 'Record Expense', icon: Receipt },
      { href: '/assets?status=listed', label: 'Record Sale', icon: CircleDollarSign },
      { href: '/payments', label: 'Receive Profit', icon: HandCoins },
      {
        href: '#manual-profit',
        label: 'Add Manual Profit',
        icon: Sparkles,
        onClick: () => setManualOpen(true),
      },
      { href: '/capital', label: 'Deploy Capital', icon: Wallet },
    ],
    [],
  );

  const periodEmpty = bundle.isFuture || !bundle.period.hasData;
  const [profitView, setProfitView] = useState<'mine' | 'business'>('mine');

  return (
    <div className="mx-auto max-w-[1440px] space-y-8 pb-14">
      {/* Header */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-ac-accent">
            Investment OS
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-ac-text-secondary">
            Personal vehicle investment portfolio · {bundle.range.label}
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
                onClick={() =>
                  navigateRange('month', { month: shiftMonth(monthCursor, -1) })
                }
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
                onClick={() =>
                  navigateRange('month', { month: shiftMonth(monthCursor, 1) })
                }
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

      {/* Quick actions */}
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

      {/* Hero KPIs — rotating pool model */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <HeroMetric
          label="Working Capital"
          valuePaise={bundle.hero.workingCapitalPaise}
          accent
        />
        <HeroMetric
          label="Current Investment"
          valuePaise={bundle.hero.currentInvestmentPaise}
          accent
        />
        <HeroMetric label="Free Cash" valuePaise={bundle.hero.freeCashPaise} accent />
        <HeroMetric
          label="Lifetime Purchase Volume"
          valuePaise={bundle.hero.lifetimePurchaseVolumePaise}
        />
        <HeroMetric
          label="Gross Business Profit"
          valuePaise={bundle.hero.grossBusinessProfitPaise}
        />
        <HeroMetric
          label="My Lifetime Profit"
          valuePaise={bundle.hero.myLifetimeProfitPaise}
        />
      </div>

      {/* Secondary row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Initial Capital"
          valuePaise={bundle.secondary.initialCapitalPaise}
        />
        <StatTile
          label="Active Vehicles"
          valueText={String(bundle.secondary.activeVehicles)}
        />
        <StatTile
          label="Vehicles Sold"
          valueText={String(bundle.secondary.vehiclesSold)}
        />
        <StatTile
          label="Average Profit Per Vehicle"
          valuePaise={bundle.secondary.avgProfitPerVehiclePaise}
        />
      </div>

      {/* Analytic rows: graph 65% + related KPIs 35% */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-wider text-ac-text-muted">
          Chart view
        </p>
        <div className="flex gap-1.5">
          {(
            [
              { key: 'mine' as const, label: 'My Profit / ROI' },
              { key: 'business' as const, label: 'Business Profit / ROI' },
            ] as const
          ).map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setProfitView(v.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition',
                profitView === v.key
                  ? 'bg-ac-accent/20 text-ac-accent ring-1 ring-ac-accent/40'
                  : 'bg-white/5 text-ac-text-secondary hover:bg-white/10',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <AnalyticRow
        title="Portfolio Growth"
        subtitle={
          profitView === 'mine'
            ? 'Cumulative my profit trajectory'
            : 'Cumulative gross business profit'
        }
        empty={
          (profitView === 'mine'
            ? bundle.chartBlocks.portfolioGrowth.seriesMine
            : bundle.chartBlocks.portfolioGrowth.seriesBusiness
          ).length === 0
        }
        chart={
          <PortfolioGrowthArea
            data={
              profitView === 'mine'
                ? bundle.chartBlocks.portfolioGrowth.seriesMine
                : bundle.chartBlocks.portfolioGrowth.seriesBusiness
            }
          />
        }
        kpis={bundle.chartBlocks.portfolioGrowth.kpis}
      />

      <AnalyticRow
        title="Monthly Profit"
        subtitle={`${bundle.range.label} · ${profitView === 'mine' ? 'My share' : 'Gross business'}`}
        empty={
          periodEmpty &&
          (profitView === 'mine'
            ? bundle.chartBlocks.monthlyProfit.seriesMine
            : bundle.chartBlocks.monthlyProfit.seriesBusiness
          ).every((s) => s.valuePaise === 0)
        }
        chart={
          <MonthlyProfitBars
            data={
              profitView === 'mine'
                ? bundle.chartBlocks.monthlyProfit.seriesMine
                : bundle.chartBlocks.monthlyProfit.seriesBusiness
            }
          />
        }
        kpis={bundle.chartBlocks.monthlyProfit.kpis}
      />

      <AnalyticRow
        title="Current Capital Allocation"
        subtitle="Where your money sits right now"
        empty={bundle.chartBlocks.capitalAllocation.series.length === 0}
        chart={<CapitalAllocationDonut data={bundle.chartBlocks.capitalAllocation.series} />}
        kpis={bundle.chartBlocks.capitalAllocation.kpis}
      />

      <AnalyticRow
        title="Investment Flow"
        subtitle={`Purchases → repairs → sale → profit · ${bundle.range.label}`}
        empty={periodEmpty}
        chart={<InvestmentWaterfall data={bundle.chartBlocks.waterfall.series} />}
        kpis={bundle.chartBlocks.waterfall.kpis}
      />

      {/* ROI compare */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ROI Comparison</CardTitle>
          <p className="text-xs text-ac-text-muted">Business vs personal returns</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Business ROI"
              valueText={`${(bundle.chartBlocks.roiCompare.businessRoiBps / 100).toFixed(1)}%`}
            />
            <StatTile
              label="My ROI"
              valueText={`${(bundle.chartBlocks.roiCompare.myRoiBps / 100).toFixed(1)}%`}
            />
            <StatTile
              label="Period Business ROI"
              valueText={`${(bundle.chartBlocks.roiCompare.periodBusinessRoiBps / 100).toFixed(1)}%`}
            />
            <StatTile
              label="Period My ROI"
              valueText={`${(bundle.chartBlocks.roiCompare.periodMyRoiBps / 100).toFixed(1)}%`}
            />
          </div>
        </CardContent>
      </Card>

      {/* Portfolio Summary — lifetime */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Portfolio Summary</CardTitle>
          <p className="text-xs text-ac-text-muted">Lifetime · all-time performance</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile
              label="Working Capital"
              valuePaise={bundle.portfolioSummary.workingCapitalPaise}
            />
            <StatTile
              label="Free Cash"
              valuePaise={bundle.portfolioSummary.freeCashPaise}
            />
            <StatTile
              label="Current Investment"
              valuePaise={bundle.portfolioSummary.currentInvestmentPaise}
            />
            <StatTile
              label="Lifetime Purchase Volume"
              valuePaise={bundle.portfolioSummary.lifetimePurchaseVolumePaise}
            />
            <StatTile
              label="Gross Business Profit"
              valuePaise={bundle.portfolioSummary.grossBusinessProfitPaise}
            />
            <StatTile
              label="My Lifetime Profit"
              valuePaise={bundle.portfolioSummary.myLifetimeProfitPaise}
            />
            <StatTile
              label="Business ROI"
              valueText={`${(bundle.portfolioSummary.businessRoiBps / 100).toFixed(1)}%`}
            />
            <StatTile
              label="My ROI"
              valueText={`${(bundle.portfolioSummary.myRoiBps / 100).toFixed(1)}%`}
            />
            <StatTile
              label="Initial Capital"
              valuePaise={bundle.portfolioSummary.initialCapitalPaise}
            />
            <StatTile
              label="Vehicles Sold"
              valueText={String(bundle.portfolioSummary.vehiclesSold)}
            />
            <StatTile
              label="Average Profit per Vehicle (Mine)"
              valuePaise={bundle.portfolioSummary.avgProfitPerVehiclePaise}
            />
            <StatTile
              label="Average Holding Days"
              valueText={`${bundle.portfolioSummary.avgHoldingDays} days`}
            />
          </div>
        </CardContent>
      </Card>

      {/* Period section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {bundle.range.key === 'month' ? 'Current Month' : 'Selected Period'}
          </CardTitle>
          <p className="text-xs text-ac-text-muted">{bundle.period.label}</p>
        </CardHeader>
        <CardContent>
          {bundle.isFuture || !bundle.period.hasData ? (
            <p className="py-10 text-center text-sm text-ac-text-muted">
              No data available for this period.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="Vehicles Purchased"
                valueText={String(bundle.period.vehiclesPurchased)}
              />
              <StatTile
                label="Vehicles Sold"
                valueText={String(bundle.period.vehiclesSold)}
              />
              <StatTile label="Purchases (volume)" valuePaise={bundle.period.moneyInvestedPaise} />
              <StatTile
                label="Capital Recovered"
                valuePaise={bundle.period.capitalRecoveredPaise}
              />
              <StatTile label="Gross Profit" valuePaise={bundle.period.grossProfitPaise} />
              <StatTile label="My Profit" valuePaise={bundle.period.myProfitPaise} />
              <StatTile label="Repairs" valuePaise={bundle.period.repairsPaise} />
              <StatTile label="Free Cash" valuePaise={bundle.period.freeCashPaise} />
              <StatTile
                label="Working Capital"
                valuePaise={bundle.period.workingCapitalPaise}
              />
              <StatTile
                label="Current Investment"
                valuePaise={bundle.period.currentInvestmentPaise}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity + Manual profit */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Activity Timeline</CardTitle>
            <p className="text-xs text-ac-text-muted">Purchase → repair → sale</p>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-0 border-l border-white/10 pl-5">
              {(bundle.timeline.length ? bundle.timeline : bundle.activity.slice(0, 12)).length ===
              0 ? (
                <p className="text-sm text-ac-text-muted">No data available for this period.</p>
              ) : (
                (bundle.timeline.length ? bundle.timeline : bundle.activity.slice(0, 12)).map(
                  (item, i) => (
                    <li key={item.id} className="relative pb-5 last:pb-0">
                      <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-ac-accent shadow-[0_0_10px_var(--ac-accent-glow)]" />
                      <motion.div
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                      >
                        <p className="text-sm font-medium">
                          {activityTitle(item.action, item.afterState)}
                        </p>
                        <p className="text-xs text-ac-text-muted">
                          {new Date(item.createdAt).toLocaleString('en-IN')}
                          {item.entityType ? ` · ${item.entityType}` : ''}
                        </p>
                      </motion.div>
                    </li>
                  ),
                )
              )}
            </ol>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Manual Profit</CardTitle>
            <Wallet className="h-4 w-4 text-ac-accent" />
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-ac-text-secondary">
              Record non-vehicle returns — bonuses, adjustments, settlements. Included in lifetime
              profit and ROI.
            </p>
            <Button onClick={() => setManualOpen(true)} className="w-full">
              <Plus className="h-4 w-4" />
              Add Manual Profit
            </Button>
          </CardContent>
        </Card>
      </div>

      <AnimatePresence>
        {manualOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setManualOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="ac-glass-card w-full max-w-lg p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Add Manual Profit</h2>
                  <p className="text-sm text-ac-text-secondary">
                    Non-vehicle investment returns & adjustments
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  className="rounded-md p-1.5 text-ac-text-muted hover:bg-white/10 hover:text-ac-text"
                  onClick={() => setManualOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ManualProfitForm
                onSuccess={() => {
                  setManualOpen(false);
                  router.refresh();
                }}
              />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
