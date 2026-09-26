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
  compact?: boolean;
};

export function CheckoutRoomElectricityBreakdown({
  allocation,
  liveTotalBillPaise,
  liveSharePaise,
  loading = false,
  compact = false,
}: Props) {
  if (!allocation && liveTotalBillPaise == null) return null;

  const totalBillPaise = liveTotalBillPaise ?? allocation?.totalBillPaise ?? 0;
  const currentSharePaise =
    liveSharePaise ??
    allocation?.currentResidentRemainingDuePaise ??
    allocation?.currentResidentSharePaise ??
    0;
  const roomCollected = allocation?.alreadyCollectedPaise ?? 0;
  const remainingRoom = allocation?.remainingToRecoverPaise ?? Math.max(0, totalBillPaise - roomCollected);
  const residentPaid = allocation?.currentResidentCollectedPaise ?? 0;
  const residentFair = allocation?.currentResidentFairSharePaise ?? 0;
  const othersPaid = allocation?.otherResidentsCollectedPaise ?? Math.max(0, roomCollected - residentPaid);
  const unallocated = allocation?.unallocatedCollectedPaise ?? 0;

  return (
    <section
      className={
        'rounded-2xl border border-white/[0.08] bg-[#0E1116] ' + (compact ? 'p-3' : 'p-5')
      }
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
        Room electricity bill
      </h3>
      <dl className={compact ? 'mt-2 grid gap-2 sm:grid-cols-3' : 'mt-4 grid gap-3 sm:grid-cols-3'}>
        <div>
          <dt className="text-[10px] text-apg-silver">Total room bill</dt>
          <dd className={compact ? 'text-base font-semibold text-white' : 'text-xl font-semibold text-white'}>
            {inr(totalBillPaise)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-apg-silver">Collected in room (all residents)</dt>
          <dd className={compact ? 'text-base font-semibold text-emerald-400' : 'text-xl font-semibold text-emerald-400'}>
            {inr(roomCollected)}
          </dd>
          {!compact && othersPaid > 0 ? (
            <dd className="mt-0.5 text-[10px] text-apg-silver">
              Other residents: {inr(othersPaid)}
            </dd>
          ) : null}
        </div>
        <div>
          <dt className="text-[10px] text-apg-silver">Remaining for room</dt>
          <dd className={compact ? 'text-base font-semibold text-amber-300' : 'text-xl font-semibold text-amber-300'}>
            {inr(remainingRoom)}
          </dd>
        </div>
      </dl>

      <div
        className={
          compact
            ? 'mt-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2'
            : 'mt-4 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3'
        }
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
          This resident
        </p>
        <dl className="mt-2 grid gap-2 sm:grid-cols-3 text-sm">
          <div>
            <dt className="text-[10px] text-apg-silver">Fair share (occupancy)</dt>
            <dd className="font-semibold text-white">{inr(residentFair)}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-apg-silver">Already paid (this resident)</dt>
            <dd className="font-semibold text-emerald-400">{inr(residentPaid)}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-apg-silver">Due at checkout</dt>
            <dd className="font-semibold text-white">
              {inr(currentSharePaise)}
              {loading ? (
                <span className="ml-2 text-xs font-normal text-apg-silver">Updating…</span>
              ) : null}
            </dd>
          </div>
        </dl>
        {unallocated > 0 ? (
          <p className="mt-2 text-[11px] text-amber-200">
            Unallocated room collections: {inr(unallocated)} (not assigned to this resident)
          </p>
        ) : null}
      </div>

      {allocation && allocation.occupants.length > 0 && !compact ? (
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">Residents</p>
          <ul className="mt-2 divide-y divide-white/[0.06]">
            {allocation.occupants.map((line) => (
              <li key={line.bookingId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span className="font-medium text-white">{line.customerName}</span>
                <span className="text-apg-silver">
                  Fair {inr(line.fairSharePaise)} · paid {inr(line.collectedPaise)} ·{' '}
                  {line.settlementStatus === 'paid'
                    ? 'settled'
                    : line.settlementStatus === 'pending'
                      ? `due ${inr(line.checkoutSharePaise)}`
                      : `est. ${inr(line.checkoutSharePaise)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
