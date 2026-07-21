'use client';

/** Banner for fixed-stay / daily residents — simplified checkout path (no notice penalty). */
export function FixedStayCheckoutBanner({
  durationMode,
}: {
  durationMode: string | null;
}) {
  const isFixedStay =
    durationMode === 'daily' ||
    durationMode === 'weekly' ||
    durationMode === 'fixed_stay';

  if (!isFixedStay) return null;

  return (
    <div className="mb-6 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-5 py-4">
      <p className="text-sm font-semibold text-sky-100">Fixed-stay checkout</p>
      <p className="mt-1 text-xs leading-relaxed text-sky-200/90">
        This resident is on a fixed-stay product line. No 14-day notice rule applies. Electricity is
        charged at checkout only — never in the monthly room split. Deposit refund follows checkout
        settlement; credit balance (if any) is separate from escrow.
      </p>
    </div>
  );
}
