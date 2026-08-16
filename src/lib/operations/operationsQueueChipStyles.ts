/**
 * Semantic visual states for Operations queue filter chips.
 * count === 0 → inactive/neutral · count > 0 → needs attention
 */

export type OperationsQueueChipState = 'inactive' | 'attention' | 'selected';

export function operationsQueueChipState(count: number, selected: boolean): OperationsQueueChipState {
  if (selected) return 'selected';
  if (count > 0) return 'attention';
  return 'inactive';
}

export function operationsQueueChipNeedsAttention(count: number): boolean {
  return count > 0;
}

/** Outer chip / link container */
export function operationsQueueChipClass(count: number, selected: boolean): string {
  const base =
    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A1F]';
  const state = operationsQueueChipState(count, selected);
  if (state === 'selected') {
    return `${base} bg-[#FF5A1F] text-white shadow-sm shadow-[#FF5A1F]/30`;
  }
  if (state === 'attention') {
    return `${base} border border-[#FF5A1F]/60 bg-[#FF5A1F]/15 text-white hover:border-[#FF5A1F] hover:bg-[#FF5A1F]/25`;
  }
  return `${base} border border-white/5 bg-white/[0.02] text-apg-silver/50 hover:border-white/10 hover:text-apg-silver/70`;
}

/** Queue label text inside chip */
export function operationsQueueChipLabelClass(count: number, selected: boolean): string {
  const state = operationsQueueChipState(count, selected);
  if (state === 'selected') return 'text-white';
  if (state === 'attention') return 'text-white/95';
  return 'text-apg-silver/50';
}

/** Numeric count badge — stands out when action is required */
export function operationsQueueCountBadgeClass(count: number, selected: boolean): string {
  const base =
    'inline-flex min-w-[1.35rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none';
  const state = operationsQueueChipState(count, selected);
  if (state === 'selected') {
    return `${base} bg-white/20 text-white`;
  }
  if (state === 'attention') {
    return `${base} bg-[#FF5A1F] text-white ring-1 ring-[#FF5A1F]/40`;
  }
  return `${base} bg-transparent text-apg-silver/35 font-medium`;
}
