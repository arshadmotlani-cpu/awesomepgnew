import Link from 'next/link';
import { StatusChip } from '@/src/components/customer/design-system';
import { ApgCard } from '@/src/components/customer/design-system';
import { formatDate } from '@/src/lib/format';
import type { ResidentHomeStatus } from '@/src/lib/residents/residentHomeState';

const HOME_CHIP_TONE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  under_review: 'bg-sky-50 text-sky-800 ring-sky-200',
  overdue: 'bg-rose-50 text-rose-800 ring-rose-200',
  submitted: 'bg-amber-50 text-amber-800 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  refund_pending: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
  awaiting_resident_details: 'bg-violet-50 text-violet-800 ring-violet-200',
};

export function ResidentHomeStatusCard({
  status,
  bookingCode,
  checkInDate,
  expectedCheckoutDate,
}: {
  status: ResidentHomeStatus;
  bookingCode: string;
  checkInDate: string;
  expectedCheckoutDate: string | null;
}) {
  return (
    <ApgCard tier="account" className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <StatusChip status={status.chipLabel} toneMap={HOME_CHIP_TONE} />
          <h1 className="mt-3 text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
            {status.headline}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">{status.subline}</p>
        </div>
      </div>
      <p className="mt-4 text-xs text-zinc-500">
        Booking{' '}
        <Link
          href={`/booking/${bookingCode}`}
          className="font-mono font-medium text-indigo-700 hover:text-indigo-600"
        >
          {bookingCode}
        </Link>
        {' · '}Moved in {formatDate(checkInDate)}
        {expectedCheckoutDate ? ` · Leaving ${formatDate(expectedCheckoutDate)}` : ''}
      </p>
    </ApgCard>
  );
}
