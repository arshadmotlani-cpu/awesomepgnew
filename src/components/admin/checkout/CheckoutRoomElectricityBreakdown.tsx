'use client';

import { paiseToInr } from '@/src/lib/format';
import type { RoomElectricityCheckoutAllocation } from '@/src/lib/checkout/roomElectricityAllocation';

function inr(paise: number): string {
  return `₹${paiseToInr(paise).replace(/\.00$/, '')}`;
}

type Props = {
  allocation: RoomElectricityCheckoutAllocation | null;
  liveTotalBillPaise?: number | null;
  liveSharePaise?: number | null;
  loading?: boolean;
};

export function CheckoutRoomElectricityBreakdown({
  allocation,
  liveTotalBillPaise,
  liveSharePaise,
  loading = false,
}: Props) {
  if (!allocation && liveTotalBillPaise == null) return null;

  const totalBillPaise = liveTotalBillPaise ?? allocation?.totalBillPaise ?? 0;
  const currentSharePaise = liveSharePaise ?? allocation?.currentResidentSharePaise ?? 0;
  const alreadyCollected = allocation?.alreadyCollectedPaise ?? 0;
  const remaining = allocation?.remainingToRecoverPaise ?? Math.max(0, totalBillPaise - alreadyCollected);

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#0E1116] p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-apg-silver">
        Room electricity bill
      </h3>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-apg-silver">Total room bill</dt>
          <dd className="text-xl font-semibold text-white">{inr(totalBillPaise)}</dd>
        </div>
        <div>
          <dt className="text-xs text-apg-silver">Already collected</dt>
          <dd className="text-xl font-semibold text-emerald-400">{inr(alreadyCollected)}</dd>
        </div>
        <div>
          <dt className="text-xs text-apg-silver">Remaining to recover</dt>
          <dd className="text-xl font-semibold text-amber-300">{inr(remaining)}</dd>
        </div>
      </dl>

      {allocation && allocation.occupants.length > 0 ? (
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">Residents</p>
          <ul className="mt-2 divide-y divide-white/[0.06]">
            {allocation.occupants.map((line) => (
              <li key={line.bookingId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span className="font-medium text-white">{line.customerName}</span>
                <span className="text-apg-silver">
                  {line.settlementStatus === 'paid'
                    ? `Paid ${inr(line.collectedPaise)}`
                    : line.settlementStatus === 'pending'
                      ? `Pending · ${inr(line.checkoutSharePaise)}`
                      : `Estimated ${inr(line.checkoutSharePaise)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 rounded-xl bg-white/[0.04] px-4 py-3">
        <p className="text-xs text-apg-silver">Current resident share</p>
        <p className="text-2xl font-semibold text-white">
          {inr(currentSharePaise)}
          {loading ? <span className="ml-2 text-xs font-normal text-apg-silver">Updating…</span> : null}
        </p>
      </div>
    </section>
  );
}
