import type { ReactNode } from 'react';

type BadgeTone =
  | 'zinc'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'indigo'
  | 'sky'
  | 'violet';

const toneClass: Record<BadgeTone, string> = {
  zinc: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export function Badge({
  children,
  tone = 'zinc',
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ' +
        toneClass[tone]
      }
    >
      {children}
    </span>
  );
}

/**
 * Convenience: pick a tone from a status string. Anything unknown falls
 * back to zinc so new enum values don't crash the UI.
 */
export function toneForStatus(status: string): BadgeTone {
  switch (status) {
    case 'available':
    case 'active':
    case 'confirmed':
    case 'succeeded':
    case 'approved':
    case 'verified':
    case 'paid':
    case 'completed':
    case 'full':
      return 'emerald';
    case 'pending':
    case 'pending_payment':
    case 'hold':
    case 'initiated':
    case 'partial':
    case 'overdue':
      return 'amber';
    case 'cancelled':
    case 'failed':
    case 'rejected':
    case 'refunded':
    case 'partially_refunded':
      return 'rose';
    case 'blocked':
    case 'maintenance':
      return 'rose';
    case 'draft':
      return 'sky';
    case 'superseded':
      return 'violet';
    default:
      return 'zinc';
  }
}
