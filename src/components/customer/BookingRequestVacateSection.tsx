import Link from 'next/link';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';
import { residentTabHref } from '@/src/lib/accountNavigation';
import { formatDate } from '@/src/lib/format';
import { vacatingStatusLabel } from '@/src/lib/residents/vacatingJourney';

export function BookingRequestVacateSection({
  bookingId,
  bookingCode,
  durationMode,
  status,
  vacating,
}: {
  bookingId: string;
  bookingCode: string;
  durationMode: string;
  status: string;
  vacating: VacatingForBookingRow | null;
}) {
  const isMonthlyResidency =
    durationMode === 'monthly' || durationMode === 'open_ended';
  const canRequestVacate = status === 'confirmed' && isMonthlyResidency;

  if (!canRequestVacate && !vacating) return null;

  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Move-out</h2>
      {vacating ? (
        <div className="mt-3 space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
              {vacatingStatusLabel(vacating.status)}
            </span>
            <span className="text-zinc-600">
              Vacate date · {formatDate(vacating.vacatingDate)}
            </span>
          </div>
          <p className="text-zinc-600">
            {vacating.status === 'pending'
              ? 'Your request is waiting for admin approval. Refund and final settlement are calculated only after approval.'
              : vacating.status === 'approved'
                ? 'Vacate approved — deposit refund unlocks on your vacate date.'
                : vacating.status === 'completed'
                  ? 'Move-out complete. See your resident area for final settlement details.'
                  : 'See your resident area for request details.'}
          </p>
          <Link
            href={residentTabHref('vacating')}
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
