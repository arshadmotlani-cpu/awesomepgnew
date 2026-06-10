import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPaymentForCustomer } from '@/src/db/queries/customer';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { formatDate, formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

const PURPOSE_LABEL: Record<string, string> = {
  booking: 'Booking payment',
  extension: 'Stay extension',
  rent: 'Monthly rent',
  electricity: 'Electricity bill',
  refund: 'Refund',
};

const METHOD_LABEL: Record<string, string> = {
  razorpay: 'Card / UPI (Razorpay)',
  mock: 'Online',
};

export default async function PaymentReceiptPage(
  props: PageProps<'/account/payments/[paymentId]/receipt'>,
) {
  const { paymentId } = await props.params;
  const session = await requireCustomerSession(`/account/payments/${paymentId}/receipt`);

  const result = await getPaymentForCustomer(paymentId, session.customerId);
  if (!result.ok) notFound();
  const p = result.data;

  const paidWhen = p.paidAt ?? p.createdAt;

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <nav className="text-xs text-zinc-500">
        <Link href="/account/bookings" className="hover:text-indigo-600">
          My bookings
        </Link>
        <span className="mx-1">/</span>
        <span className="text-zinc-700">Payment receipt</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          Payment receipt
        </p>
        <h1 className="text-2xl font-semibold text-zinc-900">
          {paiseToInr(p.amountPaise)}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          {PURPOSE_LABEL[p.purpose] ?? titleCase(p.purpose)} · {titleCase(p.status)}
        </p>
      </header>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <dl className="space-y-3 text-sm">
          <Row label="Receipt ID" value={p.id} mono />
          <Row label="Booking" value={p.bookingCode} mono />
          <Row label="Property" value={p.pgName} />
          <Row label="Paid by" value={p.customerName} />
          <Row
            label="Payment method"
            value={METHOD_LABEL[p.provider] ?? titleCase(p.provider)}
          />
          {p.providerPaymentId ? (
            <Row label="Transaction reference" value={p.providerPaymentId} mono />
          ) : null}
          <Row label="Paid on" value={formatDateTime(paidWhen)} />
          <Row label="Billing date" value={formatDate(paidWhen)} />
        </dl>
      </section>

      <div className="mt-6 flex flex-col gap-2">
        <Link
          href={`/booking/${p.bookingCode}`}
          className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          View booking
        </Link>
        <Link
          href="/account/bookings"
          className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          All my bookings
        </Link>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={`text-right font-medium text-zinc-900 ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
