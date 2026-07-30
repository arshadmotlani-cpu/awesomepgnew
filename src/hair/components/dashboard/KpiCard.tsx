import type { LucideIcon } from 'lucide-react';
import { cn } from '@/src/hair/lib/utils';

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <div className="fyh-glass space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="fyh-kpi-label">{label}</p>
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--fyh-border)]',
            accent ? 'bg-fyh-forest/30 text-fyh-accent' : 'bg-white/8 text-fyh-text-secondary',
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={cn('fyh-kpi-value tabular-nums', accent && 'fyh-kpi-value-accent')}>{value}</p>
      {hint ? <p className="text-sm text-fyh-text-muted">{hint}</p> : null}
    </div>
  );
}
