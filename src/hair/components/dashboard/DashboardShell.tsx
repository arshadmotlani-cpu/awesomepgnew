import type { LucideIcon } from 'lucide-react';
import { cn } from '@/src/hair/lib/utils';

export function DashboardShell({
  eyebrow,
  title,
  subtitle,
  children,
  rootClassName,
  headerDensity = 'default',
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  rootClassName?: string;
  headerDensity?: 'default' | 'compact';
}) {
  const compact = headerDensity === 'compact';

  return (
    <div
      className={cn(
        'fyh-page pb-6',
        compact && 'gap-3 sm:gap-[var(--fyh-space-section)]',
        rootClassName,
      )}
    >
      <div className={compact ? 'space-y-0.5' : undefined}>
        <p className="fyh-section-eyebrow">{eyebrow}</p>
        <h1
          className={cn(
            'mt-1 font-semibold tracking-tight text-fyh-text',
            compact
              ? 'text-[1.75rem] leading-tight sm:fyh-display'
              : 'fyh-display',
          )}
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            className={cn(
              'text-fyh-text-secondary',
              compact ? 'text-[0.875rem] leading-snug sm:mt-1 sm:text-sm' : 'mt-1 text-sm',
            )}
          >
            {subtitle}
          </p>
        ) : null}
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
