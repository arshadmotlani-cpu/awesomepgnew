import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listPaymentsForBooking } from '@/src/db/queries/customer';
import { requireCustomerOwnsBooking, requireCustomerSession } from '@/src/lib/auth/guards';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import {
  ACCOUNT_BACK_LINK,
  ACCOUNT_PAGE_SUBTITLE,
  ACCOUNT_PAGE_TITLE,
  ACCOUNT_SURFACE,
  ACCOUNT_TABLE_HEAD,
} from '@/src/components/customer/accountStyles';
import { ACCOUNT_RESIDENT_HREF } from '@/src/lib/accountNavigation';

export const dynamic = 'force-dynamic';

type RouteParams = { bookingId: string };

const PURPOSE_LABEL: Record<string, string> = {
  booking: 'Booking deposit + first stay',
  extension: 'Stay extension',
  rent: 'Monthly rent',
  electricity: 'Electricity',
  refund: 'Refund',
  deposit: 'Deposit',
  deposit_deduction: 'Deposit deduction',
  adjustment: 'Adjustment',
};

const METHOD_LABEL: Record<string, string> = {
  razorpay: 'Card / UPI',
  mock: 'Online',
};

const STATUS_TONE: Record<string, string> = {
  succeeded: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  initiated: 'bg-amber-50 text-amber-700 ring-amber-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  refunded: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  partially_refunded: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
};

export default async function PaymentHistoryPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { bookingId } = await params;
  const session = await requireCustomerSession(`/account/resident/history/${bookingId}`);

  let booking: { bookingCode: string };
  try {
    booking = await requireCustomerOwnsBooking(session, bookingId);
  } catch {
    notFound();
  }

  const list = await listPaymentsForBooking(bookingId);
  const rows = list.ok ? list.data : [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-10 sm:px-6">
      <header>
        <Link href={ACCOUNT_RESIDENT_HREF} className={ACCOUNT_BACK_LINK}>
          ← Back to resident area
        </Link>
        <h1 className={`mt-2 ${ACCOUNT_PAGE_TITLE}`}>Payment history</h1>
        <p className={ACCOUNT_PAGE_SUBTITLE}>
          {session.fullName} · Booking{' '}
          <span className="font-mono text-white">{booking.bookingCode}</span>
        </p>
      </header>

      <section className={`${ACCOUNT_SURFACE} overflow-hidden`}>
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className={ACCOUNT_TABLE_HEAD}>
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Purpose</th>
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-zinc-600">
                  No payments yet for this booking.
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 text-xs text-zinc-600">
                    {formatDate(p.paidAt ?? p.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-zinc-900">
                    {PURPOSE_LABEL[p.purpose] ?? titleCase(p.purpose)}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-600">
                    {METHOD_LABEL[p.provider] ?? titleCase(p.provider)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-zinc-900">
                    {paiseToInr(p.amountPaise)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        STATUS_TONE[p.status] ?? 'bg-zinc-100 text-zinc-700 ring-zinc-200'
                      }`}
                    >
                      {titleCase(p.status)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {!list.ok ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          Couldn&apos;t reach the database.
        </p>
      ) : null}
    </div>
  );
}
