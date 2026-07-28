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
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fyh-text-muted">
          {label}
        </p>
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--fyh-border)]',
            accent ? 'bg-fyh-forest/25 text-fyh-accent' : 'bg-white/5 text-fyh-text-secondary',
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={cn('fyh-display text-2xl font-semibold tracking-tight', accent && 'text-fyh-accent')}>
        {value}
      </p>
      {hint ? <p className="text-xs text-fyh-text-muted">{hint}</p> : null}
    </div>
  );
}
