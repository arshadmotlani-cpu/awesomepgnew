import type { ReactNode } from 'react';
import Link from 'next/link';

const ACCENT: Record<string, string> = {
  indigo: 'bg-indigo-500/15 text-indigo-300',
  emerald: 'bg-emerald-500/15 text-emerald-300',
  amber: 'bg-amber-500/15 text-amber-300',
  rose: 'bg-rose-500/15 text-rose-300',
  zinc: 'bg-white/10 text-apg-silver',
  sky: 'bg-sky-500/15 text-sky-300',
  violet: 'bg-violet-500/15 text-violet-300',
  orange: 'bg-[#FF5A1F]/15 text-orange-300',
};

export function OverviewStatCard({
  label,
  value,
  icon,
  hint,
  accent = 'indigo',
  href,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  accent?: keyof typeof ACCENT;
  href?: string;
}) {
  const inner = (
    <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4 transition hover:border-white/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
          {hint ? <p className="mt-1 text-xs text-apg-silver">{hint}</p> : null}
        </div>
        {icon ? (
          <span
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${ACCENT[accent]}`}
          >
            {icon}
          </span>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A1F]">
        {inner}
      </Link>
    );
  }

  return inner;
}
