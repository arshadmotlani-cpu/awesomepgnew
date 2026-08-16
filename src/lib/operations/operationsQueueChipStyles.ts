/**
 * Semantic chip styles for Operations queue filters — zero = neutral, non-zero = attention.
 */
export function operationsQueueChipClass(count: number, selected: boolean): string {
  const base = 'rounded-full px-3 py-1.5 text-xs font-medium transition';
  if (selected) {
    return `${base} bg-[#FF5A1F] text-white`;
  }
  if (count > 0) {
    return `${base} border border-[#FF5A1F]/50 bg-[#FF5A1F]/10 text-[#FF5A1F] hover:border-[#FF5A1F] hover:bg-[#FF5A1F]/20`;
  }
  return `${base} border border-white/10 text-apg-silver hover:text-white`;
}

export function operationsQueueChipNeedsAttention(count: number): boolean {
  return count > 0;
}
