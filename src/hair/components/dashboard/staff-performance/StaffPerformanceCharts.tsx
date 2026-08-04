'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { chartHasData } from '@/src/hair/lib/staffPerformancePeriod';
import type { StaffRevenueCategory } from '@/src/hair/lib/staffPerformancePeriod';

export function ChartEmpty({ message = 'No data available' }: { message?: string }) {
  return <p className="py-16 text-center text-sm text-fyh-text-muted">{message}</p>;
}

function ChartWrap({
  children,
  height = 260,
  hasData,
}: {
  children: React.ReactNode;
  height?: number;
  hasData: boolean;
}) {
  if (!hasData) return <ChartEmpty />;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

export function StaffRevenueDonut({
  data,
}: {
  data: { staffId: string; name: string; revenuePaise: number; pct: number }[];
}) {
  const chartData = (data ?? [])
    .filter((d) => d.revenuePaise > 0)
    .map((d, i) => ({
      name: d.name,
      value: d.revenuePaise / 100,
      pct: d.pct,
      staffId: d.staffId,
      fill: FYH_CHART_COLORS[i % FYH_CHART_COLORS.length],
    }));

  return (
    <ChartWrap hasData={chartHasData(chartData.map((d) => d.value))} height={280}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          innerRadius={58}
          outerRadius={88}
          paddingAngle={2}
        >
          {chartData.map((entry) => (
            <Cell key={entry.staffId} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={FYH_CHART_TOOLTIP}
          formatter={(v, _n, item) => {
            const pct = (item?.payload as { pct?: number } | undefined)?.pct;
            return [
              `${formatChartInr(Math.round(Number(v) * 100))}${pct != null ? ` · ${pct}%` : ''}`,
              'Revenue',
            ];
          }}
        />
      </PieChart>
    </ChartWrap>
  );
}

const METRIC_KEYS: Record<
  StaffRevenueCategory,
  'servicePaise' | 'productPaise' | 'packagePaise' | 'membershipPaise' | 'combinedPaise'
> = {
  service: 'servicePaise',
  product: 'productPaise',
  package: 'packagePaise',
  membership: 'membershipPaise',
  combined: 'combinedPaise',
};

export function StaffComparisonBarChart({
  data,
  category,
}: {
  data: {
    staffId: string;
    name: string;
    servicePaise: number;
    productPaise: number;
    packagePaise: number;
    membershipPaise: number;
    combinedPaise: number;
  }[];
  category: StaffRevenueCategory;
}) {
  const key = METRIC_KEYS[category];
  const chartData = (data ?? []).map((d) => ({
    name: d.name.split(' ')[0] || d.name,
    fullName: d.name,
    revenue: (d[key] ?? 0) / 100,
  }));
  const hasData = chartHasData(chartData.map((d) => d.revenue));

  return (
    <ChartWrap hasData={hasData} height={280}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey="name" stroke="#8a8a82" fontSize={10} tickLine={false} />
        <YAxis stroke="#8a8a82" fontSize={10} tickLine={false} tickFormatter={(v) => `₹${v}`} />
        <Tooltip
          contentStyle={FYH_CHART_TOOLTIP}
          labelFormatter={(_l, payload) =>
            String((payload?.[0]?.payload as { fullName?: string } | undefined)?.fullName ?? _l)
          }
          formatter={(v) => formatChartInr(Math.round(Number(v) * 100))}
        />
        <Bar dataKey="revenue" fill="#C9A227" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartWrap>
  );
}
