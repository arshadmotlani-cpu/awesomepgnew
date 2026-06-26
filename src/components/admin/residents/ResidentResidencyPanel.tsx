import { paiseToInr } from '@/src/lib/format';
import type { ResidencyAdminView } from '@/src/services/continuousResidency';

export function ResidentResidencyPanel({
  residency,
  depositHeldPaise,
}: {
  residency: ResidencyAdminView;
  depositHeldPaise: number | null;
}) {
  return (
    <section className={`${'rounded-2xl border border-white/10 bg-[#1A1F27] p-5'}`}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-apg-silver">
        Current residency
      </h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-apg-silver">Started</dt>
          <dd className="font-medium text-white">{residency.startedAt}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Expected move-out</dt>
          <dd className="font-medium text-white">{residency.expectedMoveOut ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Current booking</dt>
          <dd className="font-medium text-white">{residency.currentBookingCode ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Location</dt>
          <dd className="font-medium text-white">
            {residency.pgName
              ? `${residency.pgName} · Room ${residency.roomNumber} · ${residency.bedCode}`
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-apg-silver">Deposit held</dt>
          <dd className="font-medium text-white">
            {depositHeldPaise != null ? paiseToInr(depositHeldPaise) : '—'}
            {residency.depositBookingCode ? (
              <span className="ml-1 text-xs text-apg-silver">
                ({residency.depositBookingCode})
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-apg-silver">Lifecycle</dt>
          <dd className="font-medium capitalize text-white">{residency.lifecycle}</dd>
        </div>
      </dl>
      {residency.bookingCodes.length > 1 ? (
        <p className="mt-4 text-xs text-apg-silver">
          Continuous stay across bookings: {residency.bookingCodes.join(' → ')}
        </p>
      ) : null}
    </section>
  );
}
