'use client';

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatInr } from '@/src/capital/lib/money';

const tooltipStyle = {
  background: 'rgba(15,15,20,0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  color: '#F4F4F5',
  fontSize: 12,
};

const COLORS = ['#22D3EE', '#8B5CF6', '#34D399', '#FBBF24', '#F87171', '#60A5FA', '#A78BFA', '#FB7185'];

function Empty() {
  return <p className="flex h-56 items-center justify-center text-sm text-ac-text-muted">No data yet</p>;
}

function Wrap({ children, height = 260 }: { children: React.ReactNode; height?: number }) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

function moneyTip(value: unknown) {
  return formatInr(Math.round(Number(value) * 100));
}

export function MonthlyProfitLine({ data }: { data: { month: string; valuePaise: number }[] }) {
  const chartData = useMemo(
    () => data.map((d) => ({ month: d.month, profit: d.valuePaise / 100 })),
    [data],
  );
  if (!chartData.length) return <Empty />;
  return (
    <Wrap>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="month" stroke="#71717A" fontSize={11} />
        <YAxis stroke="#71717A" fontSize={11} tickFormatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
        <Tooltip formatter={(v) => moneyTip(v)} contentStyle={tooltipStyle} />
        <Line
          type="monotone"
          dataKey="profit"
          name="Profit"
          stroke="#22D3EE"
          strokeWidth={2.5}
          dot={{ r: 3, fill: '#22D3EE' }}
          activeDot={{ r: 7, stroke: '#fff', strokeWidth: 2 }}
          animationDuration={900}
        />
      </LineChart>
    </Wrap>
  );
}

export function MonthlyInvestmentArea({ data }: { data: { month: string; valuePaise: number }[] }) {
  const chartData = useMemo(
    () => data.map((d) => ({ month: d.month, invested: d.valuePaise / 100 })),
    [data],
  );
  if (!chartData.length) return <Empty />;
  return (
    <Wrap>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="investFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="month" stroke="#71717A" fontSize={11} />
        <YAxis stroke="#71717A" fontSize={11} />
        <Tooltip formatter={(v) => moneyTip(v)} contentStyle={tooltipStyle} />
        <Area
          type="monotone"
          dataKey="invested"
          name="Investment"
          stroke="#8B5CF6"
          fill="url(#investFill)"
          strokeWidth={2}
          activeDot={{ r: 6 }}
          animationDuration={900}
        />
      </AreaChart>
    </Wrap>
  );
}

export function RoiGrowthLine({ data }: { data: { month: string; roiBps: number }[] }) {
  const chartData = useMemo(
    () => data.map((d) => ({ month: d.month, roi: d.roiBps / 100 })),
    [data],
  );
  if (!chartData.length) return <Empty />;
  return (
    <Wrap>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="month" stroke="#71717A" fontSize={11} />
        <YAxis stroke="#71717A" fontSize={11} tickFormatter={(v) => `${v}%`} />
        <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} contentStyle={tooltipStyle} />
        <Line
          type="monotone"
          dataKey="roi"
          name="ROI"
          stroke="#34D399"
          strokeWidth={2.5}
          activeDot={{ r: 7 }}
          animationDuration={900}
        />
      </LineChart>
    </Wrap>
  );
}

export function AllocationDonut({ data }: { data: { label: string; valuePaise: number }[] }) {
  const chartData = data
    .filter((d) => d.valuePaise > 0)
    .map((d) => ({ name: d.label, value: d.valuePaise / 100 }));
  if (!chartData.length) return <Empty />;
  return (
    <Wrap>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          innerRadius={58}
          outerRadius={90}
          paddingAngle={3}
          animationDuration={900}
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="rgba(0,0,0,0.2)" />
          ))}
        </Pie>
        <Tooltip formatter={(v) => moneyTip(v)} contentStyle={tooltipStyle} />
        <Legend />
      </PieChart>
    </Wrap>
  );
}

export function ExpensePie({ data }: { data: { label: string; valuePaise: number }[] }) {
  const chartData = data.map((d) => ({ name: d.label, value: d.valuePaise / 100 }));
  if (!chartData.length) return <Empty />;
  return (
    <Wrap>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          outerRadius={95}
          animationDuration={900}
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => moneyTip(v)} contentStyle={tooltipStyle} />
        <Legend />
      </PieChart>
    </Wrap>
  );
}

export function ProfitSourcesBar({ data }: { data: { label: string; valuePaise: number }[] }) {
  const chartData = data.map((d) => ({ label: d.label, value: d.valuePaise / 100 }));
  if (!chartData.length) return <Empty />;
  return (
    <Wrap height={280}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis type="number" stroke="#71717A" fontSize={11} />
        <YAxis type="category" dataKey="label" width={90} stroke="#71717A" fontSize={11} />
        <Tooltip formatter={(v) => moneyTip(v)} contentStyle={tooltipStyle} />
        <Bar dataKey="value" name="Profit" fill="#22D3EE" radius={[0, 6, 6, 0]} animationDuration={900} />
      </BarChart>
    </Wrap>
  );
}

export function StatusDonut({ data }: { data: { label: string; value: number }[] }) {
  const chartData = data.filter((d) => d.value > 0).map((d) => ({ name: d.label, value: d.value }));
  if (!chartData.length) return <Empty />;
  return (
    <Wrap>
      <PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={88} paddingAngle={2}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend />
      </PieChart>
    </Wrap>
  );
}

export function PortfolioOhlcChart({
  data,
}: {
  data: { month: string; openPaise: number; highPaise: number; lowPaise: number; closePaise: number }[];
}) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        month: d.month,
        open: d.openPaise / 100,
        high: d.highPaise / 100,
        low: d.lowPaise / 100,
        close: d.closePaise / 100,
        range: [d.lowPaise / 100, d.highPaise / 100],
      })),
    [data],
  );
  if (!chartData.length) return <Empty />;
  return (
    <Wrap height={300}>
      <ComposedChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="month" stroke="#71717A" fontSize={11} />
        <YAxis stroke="#71717A" fontSize={11} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, name) => [moneyTip(Array.isArray(v) ? v[1] : v), String(name)]}
        />
        <Bar dataKey="range" name="Range" fill="rgba(34,211,238,0.25)" barSize={10} />
        <Line type="monotone" dataKey="close" name="Close" stroke="#FBBF24" strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="open" name="Open" stroke="#60A5FA" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
      </ComposedChart>
    </Wrap>
  );
}
