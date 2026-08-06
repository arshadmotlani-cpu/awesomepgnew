import Link from 'next/link';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';
import { legacyResidentTabHref } from '@/src/lib/accountNavigation';
import { formatDate } from '@/src/lib/format';
import type { ExitBrainLifecycle } from '@/src/lib/exit/exitBrainStateMachine';
import {
  residentMoveOutHint,
  residentMoveOutStatusLabel,
  resolveExitLifecycleFromSnapshot,
} from '@/src/lib/exit/exitBrainLifecycleUi';
import type { ResidentExitBrainSnapshot } from '@/src/lib/exit/exitBrainTypes';

export function BookingRequestVacateSection({
  bookingId,
  bookingCode,
  durationMode,
  status,
  vacating,
  exitBrainSnapshot = null,
}: {
  bookingId: string;
  bookingCode: string;
  durationMode: string;
  status: string;
  vacating: VacatingForBookingRow | null;
  exitBrainSnapshot?: ResidentExitBrainSnapshot | null;
}) {
  const isMonthlyResidency =
    durationMode === 'monthly' || durationMode === 'open_ended';
  const canRequestVacate = status === 'confirmed' && isMonthlyResidency;
  const lifecycle: ExitBrainLifecycle = resolveExitLifecycleFromSnapshot(exitBrainSnapshot);

  if (!canRequestVacate && !vacating) return null;

  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Move-out</h2>
      {vacating ? (
        <div className="mt-3 space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
              {residentMoveOutStatusLabel(lifecycle)}
            </span>
            <span className="text-zinc-600">
              Vacate date · {formatDate(vacating.vacatingDate)}
            </span>
          </div>
          <p className="text-zinc-600">{residentMoveOutHint(lifecycle)}</p>
          <Link
            href={legacyResidentTabHref('vacating')}
            className="inline-flex text-sm font-semibold text-indigo-600 hover:text-indigo-500"
          >
            View move-out status →
          </Link>
        </div>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-zinc-600">
            To leave this PG, submit a vacate request with your move-out date. Deposit refund is a
            separate step after admin approval and your vacate date.
          </p>
          <Link
            href={`/account/resident/request-vacating/${bookingId}`}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            Request vacate
          </Link>
        </div>
      )}
      <p className="mt-3 text-xs text-zinc-500">
        Booking {bookingCode} · electricity included in rent; final meter reading is verified at
        move-out.
      </p>
    </section>
  );
}
