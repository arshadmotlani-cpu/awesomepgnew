'use client';

import { paiseToInr } from '@/src/lib/format';
import type { ExpressBookingResidentContext } from '@/src/lib/admin/expressBookingTypes';
import { posGlassCard } from '@/src/components/admin/expressBooking/expressBookingStyles';

export function CurrentTenancyCard({ ctx }: { ctx: ExpressBookingResidentContext }) {
  const t = ctx.activeTenancy;

  return (
    <div className={posGlassCard}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-apg-muted">
        Current assignment
      </p>
      {t ? (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-apg-muted">PG</dt>
            <dd className="font-medium text-white">{t.pgName}</dd>
          </div>
          <div>
            <dt className="text-xs text-apg-muted">Room · Bed</dt>
            <dd className="font-medium text-white">
              {t.roomNumber} · {t.bedCode}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-apg-muted">Booking</dt>
            <dd className="font-mono text-white">{t.bookingCode}</dd>
          </div>
          <div>
            <dt className="text-xs text-apg-muted">Status</dt>
            <dd className="capitalize text-white">
              {t.isVacating ? 'Vacating' : t.bookingStatus}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-apg-muted">Move-in</dt>
            <dd className="text-white">{t.moveInDate}</dd>
          </div>
          <div>
            <dt className="text-xs text-apg-muted">Stay type</dt>
            <dd className="capitalize text-white">{t.stayType ?? t.durationMode}</dd>
          </div>
          <div>
            <dt className="text-xs text-apg-muted">Monthly rent</dt>
            <dd className="text-white">{paiseToInr(t.monthlyRentPaise)}</dd>
          </div>
          <div>
            <dt className="text-xs text-apg-muted">Deposit held</dt>
            <dd className="text-white">{paiseToInr(ctx.depositHeldPaise)}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-amber-200/90">No active bed assigned</p>
      )}
    </div>
  );
}
