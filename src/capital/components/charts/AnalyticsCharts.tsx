'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatInr } from '@/src/capital/lib/money';

type ValuePoint = { month: string; valuePaise: number };
type CashFlowPoint = { month: string; inflowPaise: number; outflowPaise: number };
type LabelPoint = { label: string; valuePaise: number };
type CountPoint = { month: string; count: number };
type RoiPoint = { month: string; roiBps: number; myRoiBps?: number };
type HoldingPoint = { month: string; days: number };

export function ValueBarChart({ data, label }: { data: ValuePoint[]; label: string }) {
  const chartData = data.map((d) => ({ month: d.month, value: d.valuePaise / 100 }));
  if (chartData.length === 0) return <Empty />;
  return (
    <ChartWrap>
      <BarChart data={chartData}>
        <Grid />
        <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
        <YAxis stroke="#71717A" fontSize={12} tickFormatter={(v) => `₹${v}`} />
        <Tooltip formatter={(v) => formatInr(Math.round(Number(v) * 100))} contentStyle={tooltipStyle} />
        <Bar dataKey="value" name={label} fill="#22D3EE" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartWrap>
  );
}

export function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  const chartData = data.map((d) => ({
    month: d.month,
    inflow: d.inflowPaise / 100,
    outflow: d.outflowPaise / 100,
  }));
  if (chartData.length === 0) return <Empty />;
  return (
    <ChartWrap>
      <BarChart data={chartData}>
        <Grid />
        <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
        <YAxis stroke="#71717A" fontSize={12} />
        <Tooltip formatter={(v) => formatInr(Math.round(Number(v) * 100))} contentStyle={tooltipStyle} />
        <Legend />
        <Bar dataKey="inflow" name="Inflow" fill="#22D3EE" radius={[4, 4, 0, 0]} />
        <Bar dataKey="outflow" name="Outflow" fill="#F87171" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartWrap>
  );
}

export function CategoryBarChart({ data }: { data: LabelPoint[] }) {
  const chartData = data.map((d) => ({ label: d.label, value: d.valuePaise / 100 }));
  if (chartData.length === 0) return <Empty />;
  return (
    <ChartWrap>
      <BarChart data={chartData} layout="vertical">
        <Grid />
        <XAxis type="number" stroke="#71717A" fontSize={12} tickFormatter={(v) => `₹${v}`} />
        <YAxis type="category" dataKey="label" stroke="#71717A" fontSize={12} width={100} />
        <Tooltip formatter={(v) => formatInr(Math.round(Number(v) * 100))} contentStyle={tooltipStyle} />
        <Bar dataKey="value" fill="#A78BFA" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartWrap>
  );
}

export function CountLineChart({ data, label }: { data: CountPoint[]; label: string }) {
  if (data.length === 0) return <Empty />;
  return (
    <ChartWrap>
      <LineChart data={data}>
        <Grid />
        <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
        <YAxis stroke="#71717A" fontSize={12} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="count" name={label} stroke="#22D3EE" strokeWidth={2} />
      </LineChart>
    </ChartWrap>
  );
}

export function RoiLineChart({ data }: { data: RoiPoint[] }) {
  const chartData = data.map((d) => ({
    month: d.month,
    business: d.roiBps / 100,
    mine: (d.myRoiBps ?? 0) / 100,
  }));
  if (chartData.length === 0) return <Empty />;
  return (
    <ChartWrap>
      <LineChart data={chartData}>
        <Grid />
        <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
        <YAxis stroke="#71717A" fontSize={12} tickFormatter={(v) => `${v}%`} />
        <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="business" name="Business ROI" stroke="#34D399" strokeWidth={2} />
        <Line type="monotone" dataKey="mine" name="My ROI" stroke="#22D3EE" strokeWidth={2} />
      </LineChart>
    </ChartWrap>
  );
}

export function HoldingLineChart({ data }: { data: HoldingPoint[] }) {
  if (data.length === 0) return <Empty />;
  return (
    <ChartWrap>
      <LineChart data={data}>
        <Grid />
        <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
        <YAxis stroke="#71717A" fontSize={12} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="days" name="Days" stroke="#FBBF24" strokeWidth={2} />
      </LineChart>
    </ChartWrap>
  );
}

function ChartWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function Grid() {
  return <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />;
}

function Empty() {
  return <p className="text-sm text-ac-text-muted">No data yet.</p>;
}

const tooltipStyle = {
  background: 'rgba(20,20,26,0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
};
