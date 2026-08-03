'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  OwnerOccupancyTrendPoint,
  OwnerRevenueTrendPoint,
} from '@/src/services/ownerDashboardTrends';

const tooltipStyle = {
  background: 'rgba(15,15,20,0.96)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 12,
  color: '#F4F4F5',
  fontSize: 12,
};

function formatInrPaise(paise: number) {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function ChartShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs text-apg-silver">{subtitle}</p>
      <div className="mt-4 h-56 w-full">{children}</div>
    </section>
  );
}

export function OwnerRevenueTrendChart({ points }: { points: OwnerRevenueTrendPoint[] }) {
  const data = points.map((p) => ({
    label: p.label,
    rent: p.rentPaise / 100,
    electricity: p.electricityPaise / 100,
    lateFee: p.lateFeePaise / 100,
    other: p.otherIncomePaise / 100,
  }));

  if (!data.some((d) => d.rent + d.electricity + d.lateFee + d.other > 0)) {
    return (
      <ChartShell title="Revenue trend" subtitle="Last 12 months · operating revenue">
        <div className="flex h-full items-center justify-center text-sm text-apg-silver">
          No trend data yet
        </div>
      </ChartShell>
    );
  }

  return (
    <ChartShell title="Revenue trend" subtitle="Last 12 months · rent, electricity, late fees, other">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="label" stroke="#71717A" fontSize={10} tickLine={false} axisLine={false} />
          <YAxis stroke="#71717A" fontSize={10} tickLine={false} axisLine={false} width={48} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v) => [`₹${Number(v ?? 0).toLocaleString('en-IN')}`, '']}
          />
          <Line type="monotone" dataKey="rent" stroke="#FF5A1F" strokeWidth={2} dot={false} name="Rent" />
          <Line
            type="monotone"
            dataKey="electricity"
            stroke="#38BDF8"
            strokeWidth={2}
            dot={false}
            name="Electricity"
          />
          <Line type="monotone" dataKey="lateFee" stroke="#FBBF24" strokeWidth={2} dot={false} name="Late fees" />
          <Line type="monotone" dataKey="other" stroke="#A78BFA" strokeWidth={2} dot={false} name="Other" />
        </LineChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function OwnerOccupancyTrendChart({ points }: { points: OwnerOccupancyTrendPoint[] }) {
  const data = points.map((p) => ({ label: p.label, occupancy: p.occupancyPct }));

  return (
    <ChartShell title="Occupancy trend" subtitle="Portfolio occupancy % · Room OS + fallback">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="label" stroke="#71717A" fontSize={10} tickLine={false} axisLine={false} />
          <YAxis
            stroke="#71717A"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            width={32}
          />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${Number(v ?? 0)}%`, 'Occupancy']} />
          <Area
            type="monotone"
            dataKey="occupancy"
            stroke="#818CF8"
            fill="#818CF8"
            fillOpacity={0.2}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function OwnerPgSparkline({ values }: { values: number[] }) {
  if (values.length === 0) {
    return <div className="h-8 w-full rounded bg-white/5" aria-hidden />;
  }
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-8 items-end gap-0.5" aria-hidden>
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-[#FF5A1F]/70"
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
          title={formatInrPaise(v)}
        />
      ))}
    </div>
  );
}
