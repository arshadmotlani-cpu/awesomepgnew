'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FYH_CHART_TOOLTIP, formatChartInr } from '@/src/hair/components/charts/fyhChartTheme';
import { chartRows } from '@/src/hair/lib/chartRows';
import { cn } from '@/src/hair/lib/utils';
import type { InvoiceDayRow } from '@/src/hair/services/revenueDashboardReportTypes';

function Wrap({
  children,
  emptyMessage = 'No data available',
  hasData = true,
  compact = false,
}: {
  children: React.ReactNode;
  emptyMessage?: string;
  hasData?: boolean;
  compact?: boolean;
}) {
  if (!hasData) {
    return (
      <p className={cn('text-center text-sm text-fyh-text-muted', compact ? 'py-6' : 'py-12')}>
        {emptyMessage}
      </p>
    );
  }
  return (
    <div
      className={cn('w-full min-w-0', compact ? 'h-[168px] sm:h-[220px]' : 'h-[220px]')}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

export function InvoicesDayWiseChart({
  data,
  compact = false,
}: {
  data: InvoiceDayRow[] | undefined;
  compact?: boolean;
}) {
  const rows = chartRows(data);
  const chartData = rows.map((d) => ({
    label: d.label,
    total: d.totalPaise / 100,
  }));
  const hasData = chartData.some((d) => d.total > 0);

  return (
    <Wrap hasData={hasData} compact={compact}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-fyh-border/40" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatChartInr(v * 100)} width={56} />
        <Tooltip
          {...FYH_CHART_TOOLTIP}
          formatter={(value) => [formatChartInr(Number(value ?? 0) * 100), 'Total']}
        />
        <Bar dataKey="total" fill="var(--fyh-accent)" radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </Wrap>
  );
}
