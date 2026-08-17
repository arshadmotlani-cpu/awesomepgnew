import type { LucideIcon } from 'lucide-react';

export function DashboardShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fyh-page pb-6">
      <div>
        <p className="fyh-section-eyebrow">{eyebrow}</p>
        <h1 className="fyh-display mt-1 font-semibold tracking-tight text-fyh-text">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-fyh-text-secondary">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function ChartPanel({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`fyh-chart-panel ${className ?? ''}`}>
      <div className="mb-4">
        <h2 className="fyh-card-title">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-fyh-text-muted">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function HeroKpi({
  label,
  value,
  hint,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <div className="fyh-dashboard-card p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="fyh-kpi-label">{label}</p>
        {Icon ? <Icon className="h-4 w-4 text-fyh-forest opacity-80" /> : null}
      </div>
      <p className={`fyh-kpi-hero mt-3 ${accent ? 'text-fyh-forest' : ''}`}>{value}</p>
      {hint ? <p className="mt-2 text-xs text-fyh-text-muted">{hint}</p> : null}
    </div>
  );
}

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className={`flex h-8 items-end gap-0.5 ${className ?? ''}`}>
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 min-w-0 rounded-t bg-fyh-forest/70"
          style={{ height: `${Math.max(8, Math.round((v / max) * 100))}%` }}
        />
      ))}
    </div>
  );
}

export function SegmentCardUi({
  title,
  revenue,
  growth,
  sparkline,
}: {
  title: string;
  revenue: string;
  growth: string | null;
  sparkline: number[];
}) {
  return (
    <div className="fyh-dashboard-card p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-fyh-text">{title}</h3>
        {growth ? (
          <span className="text-xs font-medium text-fyh-forest">{growth}</span>
        ) : null}
      </div>
      <p className="fyh-metric-xl mt-3 text-fyh-forest">{revenue}</p>
      <div className="mt-4">
        <Sparkline values={sparkline.length ? sparkline : [0, 0]} />
      </div>
    </div>
  );
}
