'use client';

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
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
import { formatInr } from '@/src/capital/lib/money';

const tooltipStyle = {
  background: 'rgba(15,15,20,0.96)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 12,
  color: '#F4F4F5',
  fontSize: 12,
  boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
};

const COLORS = ['#22D3EE', '#8B5CF6', '#34D399', '#FBBF24', '#60A5FA', '#F87171'];

function Empty({ message = 'No data available for this period.' }: { message?: string }) {
  return (
    <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-ac-text-muted">
      {message}
    </div>
  );
}

function Wrap({ children, height = 280 }: { children: React.ReactNode; height?: number }) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

function formatAxis(rupees: number) {
  const abs = Math.abs(rupees);
  if (abs >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `₹${(rupees / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `₹${(rupees / 1_000).toFixed(0)}k`;
  return `₹${rupees.toLocaleString('en-IN')}`;
}

function moneyTip(rupees: unknown) {
  return formatInr(Math.round(Number(rupees) * 100));
}

function shortMonth(ym: string) {
  const [y, m] = ym.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(m) - 1] ?? m} ${y?.slice(2) ?? ''}`;
}

/** Cumulative portfolio growth (lifetime profit trajectory). */
export function PortfolioGrowthArea({
  data,
}: {
  data: { month: string; valuePaise: number }[];
}) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        month: shortMonth(d.month),
        value: d.valuePaise / 100,
      })),
    [data],
  );
  if (!chartData.length) return <Empty />;
  return (
    <Wrap height={300}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#22D3EE" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="month" stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis
          stroke="#71717A"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatAxis}
          width={56}
        />
        <Tooltip
          formatter={(v) => [moneyTip(v), 'Portfolio']}
          contentStyle={tooltipStyle}
          cursor={{ stroke: 'rgba(34,211,238,0.35)', strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey="value"
          name="Growth"
          stroke="#22D3EE"
          fill="url(#growthFill)"
          strokeWidth={2.5}
          activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2, fill: '#22D3EE' }}
          animationDuration={1000}
          animationEasing="ease-out"
        />
      </AreaChart>
    </Wrap>
  );
}

/** Monthly ROI line (%). */
export function MonthlyRoiLine({
  data,
  label = 'ROI',
}: {
  data: { month: string; roiBps: number }[];
  label?: string;
}) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        month: shortMonth(d.month),
        roi: d.roiBps / 100,
      })),
    [data],
  );
  if (!chartData.length) return <Empty />;
  const hasAny = chartData.some((d) => d.roi !== 0);
  if (!hasAny) return <Empty />;
  return (
    <Wrap height={300}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="roiFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#A78BFA" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="month" stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis
          stroke="#71717A"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
          width={48}
        />
        <Tooltip
          formatter={(v) => [`${Number(v).toFixed(1)}%`, label]}
          contentStyle={tooltipStyle}
          cursor={{ stroke: 'rgba(167,139,250,0.35)', strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey="roi"
          name={label}
          stroke="#A78BFA"
          fill="url(#roiFill)"
          strokeWidth={2.5}
          activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2, fill: '#A78BFA' }}
          animationDuration={1000}
          animationEasing="ease-out"
        />
      </AreaChart>
    </Wrap>
  );
}

/** Monthly profit bars. */
export function MonthlyProfitBars({
  data,
}: {
  data: { month: string; valuePaise: number }[];
}) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        month: shortMonth(d.month),
        profit: d.valuePaise / 100,
      })),
    [data],
  );
  if (!chartData.length) return <Empty />;
  const hasAny = chartData.some((d) => d.profit !== 0);
  if (!hasAny) return <Empty />;
  return (
    <Wrap height={300}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="month" stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis
          stroke="#71717A"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatAxis}
          width={56}
        />
        <Tooltip
          formatter={(v) => [moneyTip(v), 'Profit']}
          contentStyle={tooltipStyle}
          cursor={{ fill: 'rgba(34,211,238,0.08)' }}
        />
        <Bar
          dataKey="profit"
          name="Profit"
          fill="#34D399"
          radius={[6, 6, 0, 0]}
          animationDuration={900}
          activeBar={{ fill: '#6EE7B7' }}
        />
      </BarChart>
    </Wrap>
  );
}

/** Current capital allocation donut. */
export function CapitalAllocationDonut({
  data,
}: {
  data: { label: string; valuePaise: number }[];
}) {
  const chartData = data
    .filter((d) => d.valuePaise > 0)
    .map((d) => ({ name: d.label, value: d.valuePaise / 100 }));
  if (!chartData.length) return <Empty />;
  return (
    <Wrap height={300}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          innerRadius={68}
          outerRadius={104}
          paddingAngle={3}
          animationDuration={1000}
          stroke="rgba(8,8,12,0.6)"
          strokeWidth={2}
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => moneyTip(v)} contentStyle={tooltipStyle} />
      </PieChart>
    </Wrap>
  );
}

/** Investment → repairs → sale → profit waterfall (as signed flow bars). */
export function InvestmentWaterfall({
  data,
}: {
  data: { label: string; valuePaise: number; kind: 'out' | 'in' | 'result' }[];
}) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        label: d.label,
        value: d.valuePaise / 100,
        fill:
          d.kind === 'result'
            ? '#34D399'
            : d.kind === 'in'
              ? '#22D3EE'
              : '#8B5CF6',
      })),
    [data],
  );
  if (!chartData.length || chartData.every((d) => d.value === 0)) return <Empty />;
  return (
    <Wrap height={300}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="label" stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis
          stroke="#71717A"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatAxis}
          width={56}
        />
        <Tooltip formatter={(v) => moneyTip(v)} contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} animationDuration={900}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </Wrap>
  );
}
