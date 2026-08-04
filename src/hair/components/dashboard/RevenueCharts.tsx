'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  FYH_CHART_COLORS,
  FYH_CHART_TOOLTIP,
  formatChartInr,
} from '@/src/hair/components/charts/fyhChartTheme';
import { chartRows } from '@/src/hair/lib/chartRows';
import type { RevenueDashboardSnapshot } from '@/src/hair/services/revenueDashboard';

function Wrap({
  children,
  height = 260,
  emptyMessage = 'No data available',
  hasData = true,
}: {
  children: React.ReactNode;
  height?: number;
  emptyMessage?: string;
  hasData?: boolean;
}) {
  if (!hasData) {
    return <p className="py-16 text-center text-sm text-fyh-text-muted">{emptyMessage}</p>;
  }
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

export function RevenueTrend30Chart({ data }: { data: RevenueDashboardSnapshot['trend30Days'] | undefined }) {
  const rows = chartRows(data);
  const chartData = rows.map((d) => ({
    label: d.dayKey.slice(5),
    revenue: d.revenuePaise / 100,
  }));
  const hasData = chartData.some((d) => d.revenue > 0);
  return (
    <Wrap hasData={hasData}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey="label" stroke="#8a8a82" fontSize={10} tickLine={false} />
        <YAxis stroke="#8a8a82" fontSize={10} tickLine={false} tickFormatter={(v) => `₹${v}`} />
        <Tooltip
          contentStyle={FYH_CHART_TOOLTIP}
          formatter={(v) => formatChartInr(Math.round(Number(v) * 100))}
        />
        <Line type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={2} dot={false} />
      </LineChart>
    </Wrap>
  );
}

export function RevenueTrend12Chart({ data }: { data: RevenueDashboardSnapshot['trend12Months'] | undefined }) {
  const rows = chartRows(data);
  const chartData = rows.map((d) => ({ label: d.label, revenue: d.revenuePaise / 100 }));
  const hasData = chartData.some((d) => d.revenue > 0);
  return (
    <Wrap hasData={hasData}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey="label" stroke="#8a8a82" fontSize={10} tickLine={false} />
        <YAxis stroke="#8a8a82" fontSize={10} tickLine={false} />
        <Tooltip
          contentStyle={FYH_CHART_TOOLTIP}
          formatter={(v) => formatChartInr(Math.round(Number(v) * 100))}
        />
        <Bar dataKey="revenue" fill="#10B981" radius={[4, 4, 0, 0]} />
      </BarChart>
    </Wrap>
  );
}

export function RevenueByStaffChart({ data }: { data: RevenueDashboardSnapshot['revenueByStaff'] | undefined }) {
  const rows = chartRows(data);
  const chartData = rows.slice(0, 8).map((d) => ({ name: d.name, revenue: d.revenuePaise / 100 }));
  const hasData = chartData.some((d) => d.revenue > 0);
  return (
    <Wrap hasData={hasData} emptyMessage="No staff revenue this month">
      <BarChart data={chartData} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
        <XAxis type="number" stroke="#8a8a82" fontSize={10} />
        <YAxis type="category" dataKey="name" stroke="#8a8a82" fontSize={10} width={90} />
        <Tooltip
          contentStyle={FYH_CHART_TOOLTIP}
          formatter={(v) => formatChartInr(Math.round(Number(v) * 100))}
        />
        <Bar dataKey="revenue" fill="#C9A227" radius={[0, 4, 4, 0]} />
      </BarChart>
    </Wrap>
  );
}

export function PaymentMethodDonut({ data }: { data: RevenueDashboardSnapshot['paymentMethodBreakdown'] | undefined }) {
  const chartData = chartRows(data)
    .filter((d) => d.amountPaise > 0)
    .map((d, i) => ({
      name: d.method.toUpperCase(),
      value: d.amountPaise / 100,
      fill: FYH_CHART_COLORS[i % FYH_CHART_COLORS.length],
    }));
  if (!chartData.length) {
    return <p className="py-16 text-center text-sm text-fyh-text-muted">No payment data this month.</p>;
  }
  return (
    <Wrap height={240} hasData>
      <PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2}>
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip contentStyle={FYH_CHART_TOOLTIP} formatter={(v) => formatChartInr(Math.round(Number(v) * 100))} />
      </PieChart>
    </Wrap>
  );
}

export function HourlyRevenueChart({ data }: { data: RevenueDashboardSnapshot['hourlyRevenueToday'] | undefined }) {
  const rows = chartRows(data);
  const chartData = rows.filter((_, h) => h >= 8 && h <= 22).map((d) => ({
    label: d.label,
    revenue: d.revenuePaise / 100,
  }));
  const hasData = chartData.some((d) => d.revenue > 0);
  return (
    <Wrap hasData={hasData} emptyMessage="No hourly revenue today">
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey="label" stroke="#8a8a82" fontSize={9} interval={1} tickLine={false} />
        <YAxis stroke="#8a8a82" fontSize={10} tickLine={false} />
        <Tooltip
          contentStyle={FYH_CHART_TOOLTIP}
          formatter={(v) => formatChartInr(Math.round(Number(v) * 100))}
        />
        <Bar dataKey="revenue" fill="#10B981" radius={[3, 3, 0, 0]} />
      </BarChart>
    </Wrap>
  );
}

export function CategoryBarChart({ data }: { data: RevenueDashboardSnapshot['revenueByCategory'] | undefined }) {
  const rows = chartRows(data);
  const chartData = rows.slice(0, 8).map((d) => ({
    name: d.category,
    revenue: d.revenuePaise / 100,
  }));
  const hasData = chartData.some((d) => d.revenue > 0);
  return (
    <Wrap hasData={hasData} emptyMessage="No category revenue this month">
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey="name" stroke="#8a8a82" fontSize={10} tickLine={false} />
        <YAxis stroke="#8a8a82" fontSize={10} tickLine={false} />
        <Tooltip
          contentStyle={FYH_CHART_TOOLTIP}
          formatter={(v) => formatChartInr(Math.round(Number(v) * 100))}
        />
        <Bar dataKey="revenue" fill="#60A5FA" radius={[4, 4, 0, 0]} />
      </BarChart>
    </Wrap>
  );
}
