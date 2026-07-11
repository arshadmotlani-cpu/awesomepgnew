'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatInr } from '@/src/capital/lib/money';

type Point = { month: string; valuePaise?: number; profitPaise?: number };

export function MonthlyProfitChart({ data }: { data: Point[] }) {
  const chartData = data.map((d) => ({
    month: d.month,
    profit: (d.valuePaise ?? d.profitPaise ?? 0) / 100,
  }));

  if (chartData.length === 0) {
    return <p className="text-sm text-ac-text-muted">No profit data yet.</p>;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
          <YAxis stroke="#71717A" fontSize={12} tickFormatter={(v) => `₹${v}`} />
          <Tooltip
            formatter={(value) => formatInr(Math.round(Number(value) * 100))}
            contentStyle={{
              background: 'rgba(20,20,26,0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
            }}
          />
          <Bar dataKey="profit" fill="#22D3EE" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
