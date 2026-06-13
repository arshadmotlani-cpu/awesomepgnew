import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, customers, pgs } from '@/src/db/schema';
import { paiseToInr, titleCase } from '@/src/lib/format';
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
    .select({ depositPaise: bookings.depositPaise })
    .from(bookings)
    .where(eq(bookings.customerId, link.residentId))
    .orderBy(desc(bookings.createdAt))
    .limit(1);

  const depositPaise = booking?.depositPaise ?? 0;
  const rentPaise = link.purpose === 'deposit' ? 0 : link.amount;
  const depositLine = link.purpose === 'deposit' ? link.amount : 0;
  const discountPaise = 0;
  const finalPaise = link.amount;

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-zinc-950 px-4 py-10 text-white">
      <p className="text-xs uppercase tracking-wide text-zinc-500">Awesome PG · Payment</p>
      <h1 className="mt-2 text-2xl font-semibold">
        {titleCase(link.purpose)} — {pg?.name ?? 'PG'}
      </h1>
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
          {link.purpose === 'rent' && depositPaise > 0 ? (
            <p className="text-xs text-zinc-500">
              Security deposit ({paiseToInr(depositPaise)}) is not included in this rent payment.
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
          <p className="mt-3 text-xs text-zinc-500">
            After paying, upload proof from your resident account or share screenshot with admin.
          </p>
        </section>
      ) : null}

      <p className="mt-8 text-center text-xs text-zinc-600">
        <Link href="/account" className="underline hover:text-zinc-400">
          Go to my account
        </Link>
      </p>
    </main>
  );
}
