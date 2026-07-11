'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Car,
  CircleDollarSign,
  HandCoins,
  Lightbulb,
  Plus,
  Receipt,
  Sparkles,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';
import { KpiCard } from '@/src/capital/components/KpiCard';
import {
  AllocationDonut,
  ExpensePie,
  MonthlyInvestmentArea,
  MonthlyProfitLine,
  PortfolioOhlcChart,
  ProfitSourcesBar,
  RoiGrowthLine,
  StatusDonut,
} from '@/src/capital/components/charts/OverviewCharts';
import { ManualProfitForm } from '@/src/capital/components/forms/ManualProfitForm';
import { Button } from '@/src/capital/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { Input } from '@/src/capital/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/capital/components/ui/tabs';
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
  asset_status_changed: 'Vehicle Status Updated',
  asset_updated: 'Vehicle Updated',
  expense_created: 'Expense Added',
  expense_reversed: 'Expense Reversed',
  payment_created: 'Profit Received',
  payment_reversed: 'Payment Reversed',
  capital_invested: 'Capital Invested',
  capital_reversed: 'Capital Reversed',
  manual_profit_added: 'Manual Profit Added',
  settlement_created: 'Investor Paid',
  document_uploaded: 'Document Uploaded',
};

function activityTitle(action: string, afterState: unknown): string {
  if (action === 'asset_status_changed' && afterState && typeof afterState === 'object') {
    const status = (afterState as { status?: string }).status;
    if (status === 'sold' || status === 'settled') return 'Vehicle Sold';
    if (status === 'repair') return 'Repair Started';
    if (status === 'listed') return 'Vehicle Listed';
  }
  if (action === 'expense_created' && afterState && typeof afterState === 'object') {
    const cat = (afterState as { category?: string }).category;
    if (cat && /repair/i.test(cat)) return 'Repair Added';
  }
  return ACTIVITY_LABELS[action] ?? action.replace(/_/g, ' ');
}

function ChartPanel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45 }}
      whileHover={{ y: -3 }}
      className={className}
    >
      <Card className="h-full transition-shadow duration-300 hover:shadow-[0_16px_48px_rgba(0,0,0,0.4)]">
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </motion.div>
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

  const navigateRange = (key: string, f?: string, t?: string) => {
    const params = new URLSearchParams();
    params.set('range', key);
    if (key === 'custom') {
      if (f) params.set('from', f);
      if (t) params.set('to', t);
    }
    router.push(`/dashboard?${params.toString()}`);
  };

  const quickActions = useMemo(
    () => [
      { href: '/assets/new', label: 'Add Vehicle', icon: Car },
      { href: '/expenses', label: 'Record Expense', icon: Receipt },
      { href: '/assets?status=listed', label: 'Sell Vehicle', icon: CircleDollarSign },
      { href: '/payments', label: 'Receive Profit', icon: HandCoins },
      { href: '#manual-profit', label: 'Add Manual Profit', icon: Sparkles, onClick: () => setManualOpen(true) },
      { href: '/capital', label: 'Add Investor', icon: UserPlus },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-8 pb-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-ac-accent">Investment OS</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-ac-text-secondary">
            Executive portfolio command center · {bundle.range.label}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => {
                  if (r.key === 'custom') navigateRange('custom', from || undefined, to || undefined);
                  else navigateRange(r.key);
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
          {bundle.range.key === 'custom' ? (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-[10px] uppercase text-ac-text-muted">From</label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase text-ac-text-muted">To</label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36" />
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigateRange('custom', from, to)}
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {bundle.kpis.map((k, i) => (
          <KpiCard
            key={k.title}
            title={k.title}
            index={i}
            icon={k.icon}
            trend={k.trend}
            changePct={'changePct' in k ? k.changePct : null}
            valuePaise={'valuePaise' in k ? k.valuePaise : undefined}
            valueText={'valueText' in k ? k.valueText : undefined}
            href={'href' in k ? k.href : undefined}
          />
        ))}
      </div>

      {bundle.insights.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Lightbulb className="h-4 w-4 text-ac-warning" />
            <CardTitle className="text-base">Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {bundle.insights.map((insight) => (
                <li
                  key={insight}
                  className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm text-ac-text-secondary"
                >
                  {insight}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Monthly Profit Trend">
          <MonthlyProfitLine data={bundle.charts.monthlyProfit} />
        </ChartPanel>
        <ChartPanel title="Monthly Investment">
          <MonthlyInvestmentArea data={bundle.charts.monthlyInvestment} />
        </ChartPanel>
        <ChartPanel title="ROI Growth">
          <RoiGrowthLine data={bundle.charts.roiGrowth} />
        </ChartPanel>
        <ChartPanel title="Capital Allocation">
          <AllocationDonut data={bundle.charts.capitalAllocation} />
        </ChartPanel>
        <ChartPanel title="Expense Breakdown">
          <ExpensePie data={bundle.charts.expenseBreakdown} />
        </ChartPanel>
        <ChartPanel title="Vehicle Status">
          <StatusDonut data={bundle.charts.vehicleStatus} />
        </ChartPanel>
      </div>

      <ChartPanel title="Profit Sources">
        <Tabs defaultValue="brand">
          <TabsList>
            <TabsTrigger value="brand">Brand</TabsTrigger>
            <TabsTrigger value="source">Investor / Source</TabsTrigger>
            <TabsTrigger value="vehicle">Vehicle</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
          <TabsContent value="brand">
            <ProfitSourcesBar data={bundle.charts.profitByManufacturer} />
          </TabsContent>
          <TabsContent value="source">
            <ProfitSourcesBar data={bundle.charts.profitBySource} />
          </TabsContent>
          <TabsContent value="vehicle">
            <ProfitSourcesBar data={bundle.charts.profitByVehicle} />
          </TabsContent>
          <TabsContent value="month">
            <ProfitSourcesBar data={bundle.charts.profitByMonth} />
          </TabsContent>
        </Tabs>
      </ChartPanel>

      <ChartPanel title="Portfolio Performance">
        <PortfolioOhlcChart data={bundle.charts.portfolioOhlc} />
      </ChartPanel>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-0 border-l border-white/10 pl-5">
              {bundle.activity.length === 0 ? (
                <p className="text-sm text-ac-text-muted">No activity yet</p>
              ) : (
                bundle.activity.map((item, i) => (
                  <li key={item.id} className="relative pb-5 last:pb-0">
                    <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-ac-accent shadow-[0_0_10px_var(--ac-accent-glow)]" />
                    <motion.div
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <p className="text-sm font-medium">{activityTitle(item.action, item.afterState)}</p>
                      <p className="text-xs text-ac-text-muted">
                        {new Date(item.createdAt).toLocaleString('en-IN')}
                        {item.entityType ? ` · ${item.entityType}` : ''}
                      </p>
                    </motion.div>
                  </li>
                ))
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
              Record non-vehicle profits — settlements, bonuses, adjustments. They flow into totals,
              ROI, charts, and the ledger.
            </p>
            <Button onClick={() => setManualOpen(true)} className="w-full">
              <Plus className="h-4 w-4" />
              Add Manual Profit
            </Button>
            <p className="text-xs text-ac-text-muted">
              Lifetime manual profit included in dashboard totals.
            </p>
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
