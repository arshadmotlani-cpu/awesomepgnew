import Link from 'next/link';
import {
  ACCOUNT_LINK_ON_DARK,
  ACCOUNT_LINK_IN_SURFACE,
  ACCOUNT_PAGE_SUBTITLE,
  ACCOUNT_PAGE_TITLE,
  ACCOUNT_SURFACE,
} from '@/src/components/customer/accountStyles';
import { residentTabHref } from '@/src/lib/accountNavigation';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';

const STATUS_TONE: Record<string, string> = {
  pending_payment: 'bg-amber-50 text-amber-700 ring-amber-200',
  pending_approval: 'bg-amber-50 text-amber-700 ring-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 ring-rose-200',
  refunded: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  draft: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
};

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'bg-zinc-100 text-zinc-700 ring-zinc-200';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      {titleCase(status.replace(/_/g, ' '))}
    </span>
  );
}

function plainDuration(mode: string): string {
  if (mode === 'monthly') return 'Monthly stay';
  if (mode === 'open_ended') return 'Open-ended stay';
  return titleCase(mode.replace(/_/g, ' '));
}

export function ApplicationBookingsList({
  rows,
  showResidentHome = false,
}: {
  rows: Array<{
    id: string;
    bookingCode: string;
    pgName: string;
    bedCount: number;
    checkInDate: string | null;
    durationMode: string;
    totalPaise: number;
    discountPaise: number;
    status: string;
  }>;
  showResidentHome?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className={`${ACCOUNT_SURFACE} p-8 text-center text-sm text-zinc-600`}>
        <p className="font-semibold text-zinc-900">No bookings yet</p>
        <Link href="/pgs" className={`mt-3 inline-block ${ACCOUNT_LINK_ON_DARK}`}>
          Find a PG →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className={`${ACCOUNT_SURFACE} p-5`}>
        <h2 className="text-base font-semibold text-zinc-900">What to do next</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Open your booking to pay, upload identity, or see check-in details.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/booking/${rows[0].bookingCode}`}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            Open latest booking
          </Link>
          {showResidentHome ? (
            <Link
              href={residentTabHref('home')}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Resident home
            </Link>
          ) : null}
        </div>
      </section>

      <ul className={`${ACCOUNT_SURFACE} divide-y divide-zinc-200`}>
        {rows.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div>
              <Link
                href={`/booking/${b.bookingCode}`}
                className={`font-mono text-sm font-semibold ${ACCOUNT_LINK_IN_SURFACE}`}
              >
                {b.bookingCode}
              </Link>
              <p className="mt-0.5 text-sm text-zinc-800">
                {b.pgName} · {b.bedCount} bed{b.bedCount === 1 ? '' : 's'}
                {b.checkInDate ? ` · Check-in ${formatDate(b.checkInDate)}` : ''}
              </p>
              <p className="text-xs text-zinc-600">
                {plainDuration(b.durationMode)} · {paiseToInr(b.totalPaise)}
              </p>
            </div>
            <StatusBadge status={b.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export { ACCOUNT_PAGE_TITLE, ACCOUNT_PAGE_SUBTITLE };
