import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  icon,
  hint,
  accent = 'indigo',
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  accent?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'zinc' | 'sky';
}) {
  const accentClass = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
    zinc: 'bg-zinc-100 text-zinc-600',
    sky: 'bg-sky-50 text-sky-600',
  }[accent];

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">{value}</p>
          {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
        </div>
        {icon ? (
          <span
            className={
              'inline-flex h-10 w-10 items-center justify-center rounded-lg ' + accentClass
            }
          >
            {icon}
          </span>
        ) : null}
      </div>
    </div>
  );
}
