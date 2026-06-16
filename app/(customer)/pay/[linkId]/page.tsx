import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, customers, pgs } from '@/src/db/schema';
import { paiseToInr, titleCase } from '@/src/lib/format';
import { PaymentLinkProofForm } from '@/src/components/customer/PaymentLinkProofForm';
import { getPaymentLinkById } from '@/src/services/paymentLinks';

export const dynamic = 'force-dynamic';

export default async function PaymentLinkPage({
  params,
}: {
  params: Promise<{ linkId: string }>;
}) {
  const { linkId } = await params;
  const link = await getPaymentLinkById(linkId);
  if (!link || link.status === 'expired') notFound();

  const [resident] = await db
    .select({ fullName: customers.fullName, phone: customers.phone })
    .from(customers)
    .where(eq(customers.id, link.residentId))
    .limit(1);

  const [pg] = await db
    .select({ name: pgs.name })
    .from(pgs)
    .where(eq(pgs.id, link.pgId))
    .limit(1);

  const [booking] = await db
    .select({
      depositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
    })
    .from(bookings)
    .where(eq(bookings.customerId, link.residentId))
    .orderBy(desc(bookings.createdAt))
    .limit(1);

  const depositDuePaise = booking?.depositDuePaise ?? 0;
  const combinedDeposit =
    link.purpose === 'rent' && depositDuePaise > 0 && link.amount > depositDuePaise
      ? depositDuePaise
      : 0;
  const rentPaise =
    link.purpose === 'rent'
      ? combinedDeposit > 0
        ? link.amount - combinedDeposit
        : link.amount
      : 0;
  const depositLine = link.purpose === 'deposit' ? link.amount : combinedDeposit;
  const discountPaise = 0;
  const finalPaise = link.amount;

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-zinc-950 px-4 py-10 text-white">
      <p className="text-xs uppercase tracking-wide text-zinc-500">Awesome PG · Payment</p>
      <h1 className="mt-2 text-2xl font-semibold">
        {link.title ?? `${titleCase(link.purpose)} — ${pg?.name ?? 'PG'}`}
      </h1>
      {link.description ? (
        <p className="mt-2 text-sm text-zinc-400">{link.description}</p>
      ) : null}
      {resident ? (
        <p className="mt-1 text-sm text-zinc-400">
          {resident.fullName} · {resident.phone}
        </p>
      ) : null}

      <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-sm font-semibold text-zinc-300">Breakdown</h2>
        <dl className="mt-4 space-y-3 text-sm">
          {rentPaise > 0 ? (
            <div className="flex justify-between">
              <dt className="text-zinc-400">Rent</dt>
              <dd>{paiseToInr(rentPaise)}</dd>
            </div>
          ) : null}
          {discountPaise > 0 ? (
            <div className="flex justify-between text-emerald-400">
              <dt>Discount</dt>
              <dd>−{paiseToInr(discountPaise)}</dd>
            </div>
          ) : null}
          {depositLine > 0 ? (
            <div className="flex justify-between">
              <dt className="text-zinc-400">Deposit</dt>
              <dd>{paiseToInr(depositLine)}</dd>
            </div>
          ) : null}
          {link.purpose === 'rent' && combinedDeposit === 0 && (booking?.depositPaise ?? 0) > 0 ? (
            <p className="text-xs text-zinc-500">
              Security deposit ({paiseToInr(booking!.depositPaise)}) is not included in this rent
              payment.
            </p>
          ) : null}
          {combinedDeposit > 0 ? (
            <p className="text-xs text-emerald-400">
              Combined payment — rent and remaining deposit in one QR (rent UPI account).
            </p>
          ) : null}
          <div className="flex justify-between border-t border-zinc-800 pt-3 text-base font-semibold">
            <dt>Payable now</dt>
            <dd className="text-[#FF5A1F]">{paiseToInr(finalPaise)}</dd>
          </div>
        </dl>
      </section>

      {link.upiQrUrl ? (
        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-center">
          <h2 className="text-sm font-semibold text-zinc-300">Scan to pay (UPI / QR)</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={link.upiQrUrl}
            alt="UPI QR code"
            className="mx-auto mt-4 max-h-64 rounded-lg bg-white p-2"
          />
        </section>
      ) : null}

      {(link.purpose === 'deposit' && link.bookingId) || link.rentInvoiceId ? (
        <section className="mt-6">
          <PaymentLinkProofForm
            linkId={link.id}
            amountLabel={paiseToInr(finalPaise)}
            qrImageUrl={link.upiQrUrl}
            existingProofUrl={link.paymentProofUrl}
            title={link.title}
          />
        </section>
      ) : (
        <p className="mt-6 text-center text-xs text-zinc-500">
          After paying, upload proof from your resident account or share screenshot with admin.
        </p>
      )}

      <p className="mt-8 text-center text-xs text-zinc-600">
        <Link href="/account" className="underline hover:text-zinc-400">
          Go to my account
        </Link>
      </p>
    </main>
  );
}
