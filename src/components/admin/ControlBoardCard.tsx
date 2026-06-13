'use client';

import type { ControlBoardCardAccent } from '@/src/lib/controlBoard/types';

const ACCENT: Record<ControlBoardCardAccent, string> = {
  indigo: 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/20',
  emerald: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/20',
  amber: 'bg-amber-500/15 text-amber-300 ring-amber-500/20',
  rose: 'bg-rose-500/15 text-rose-300 ring-rose-500/20',
  zinc: 'bg-white/10 text-apg-silver ring-white/10',
  sky: 'bg-sky-500/15 text-sky-300 ring-sky-500/20',
  violet: 'bg-violet-500/15 text-violet-300 ring-violet-500/20',
  orange: 'bg-[#FF5A1F]/15 text-orange-300 ring-[#FF5A1F]/20',
};

const PRIORITY_RING: Record<string, string> = {
  high: 'ring-2 ring-rose-500/50',
  medium: 'ring-2 ring-amber-500/40',
};

type Props = {
  label: string;
  value: string;
  hint?: string;
  accent?: ControlBoardCardAccent;
  priority?: 'high' | 'medium' | 'low';
  onClick: () => void;
  loading?: boolean;
};

export function ControlBoardCard({
  label,
  value,
  hint,
  accent = 'indigo',
  priority,
  onClick,
  loading,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={
        'group w-full rounded-xl border border-white/10 bg-[#1A1F27] p-4 text-left transition ' +
        'hover:border-[#FF5A1F]/50 hover:bg-[#1F2630] hover:shadow-lg hover:shadow-[#FF5A1F]/5 ' +
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A1F] ' +
        'disabled:opacity-60 ' +
        (priority ? PRIORITY_RING[priority] ?? '' : '')
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</p>
          <p className="mt-2 truncate text-xl font-semibold tracking-tight text-white sm:text-2xl">
            {loading ? '…' : value}
          </p>
          {hint ? <p className="mt-1 line-clamp-2 text-xs text-apg-silver">{hint}</p> : null}
        </div>
        <span
          className={
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg opacity-60 transition ' +
            'group-hover:opacity-100 ' +
            ACCENT[accent]
          }
          aria-hidden
        >
          →
        </span>
      </div>
      <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-[#FF5A1F]/80 opacity-0 transition group-hover:opacity-100">
        Tap to drill down
      </p>
    </button>
  );
}
