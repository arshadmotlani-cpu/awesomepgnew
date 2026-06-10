import Link from 'next/link';
import { listBookingsForCustomer } from '@/src/db/queries/customer';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { formatIndianPhoneDisplay } from '@/src/lib/phone';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { LogoutButton } from '@/src/components/auth/LogoutButton';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, string> = {
  pending_payment: 'bg-amber-50 text-amber-700 ring-amber-200',
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

export default async function AccountBookingsPage() {
  const session = await requireCustomerSession('/account/bookings');
  const bookings = await listBookingsForCustomer(session.customerId);
  const rows = bookings.ok ? bookings.data : [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            My bookings
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Signed in as {session.fullName} · {formatIndianPhoneDisplay(session.phone)}
          </p>
        </div>
        <LogoutButton scope="customer" />
      </header>

      {bookings.ok === false ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          Couldn&apos;t reach the database.
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
          <p className="font-medium text-zinc-700">No bookings yet.</p>
          <Link href="/pgs" className="mt-3 inline-block text-indigo-600 hover:text-indigo-500">
            Browse PGs →
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white shadow-sm">
          {rows.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
              <div>
                <Link
                  href={`/booking/${b.bookingCode}`}
                  className="font-mono text-sm font-semibold text-indigo-600 hover:text-indigo-500"
                >
                  {b.bookingCode}
                </Link>
                <p className="mt-0.5 text-sm text-zinc-600">
                  {b.pgName} · {b.bedCount} bed{b.bedCount === 1 ? '' : 's'}
                  {b.checkInDate ? ` · Check-in ${formatDate(b.checkInDate)}` : ''}
                </p>
                <p className="text-xs text-zinc-500">
                  {titleCase(b.durationMode.replace('_', ' '))} · {paiseToInr(b.totalPaise)}
                </p>
              </div>
              <StatusBadge status={b.status} />
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm text-zinc-500">
        Monthly stay?{' '}
        <Link href="/account/resident" className="font-medium text-indigo-600 hover:text-indigo-500">
          Open resident dashboard →
        </Link>
      </p>
    </div>
  );
}
