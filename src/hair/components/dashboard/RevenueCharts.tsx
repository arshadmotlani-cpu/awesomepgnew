'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FYH_CHART_TOOLTIP, formatChartInr } from '@/src/hair/components/charts/fyhChartTheme';
import { chartRows } from '@/src/hair/lib/chartRows';
import type { InvoiceDayRow } from '@/src/hair/services/revenueDashboardReportTypes';

function Wrap({
  children,
  height = 220,
  emptyMessage = 'No data available',
  hasData = true,
}: {
  children: React.ReactNode;
  height?: number;
  emptyMessage?: string;
  hasData?: boolean;
}) {
  if (!hasData) {
    return <p className="py-12 text-center text-sm text-fyh-text-muted">{emptyMessage}</p>;
  }
  return (
    <div style={{ height }} className="w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

export function InvoicesDayWiseChart({ data }: { data: InvoiceDayRow[] | undefined }) {
  const rows = chartRows(data);
  const chartData = rows.map((d) => ({
    label: d.label,
    total: d.totalPaise / 100,
  }));
  const hasData = chartData.some((d) => d.total > 0);

  return (
    <Wrap hasData={hasData}>
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
