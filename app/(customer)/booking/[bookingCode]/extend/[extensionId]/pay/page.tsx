import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getExtensionDetail } from '@/src/db/queries/customer';
import {
  requireCustomerOwnsBookingCode,
  requireCustomerSession,
} from '@/src/lib/auth/guards';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import {
  CancelPendingExtensionForm,
  RazorpayExtensionCheckoutButton,
} from '@/src/components/customer/ExtensionPayButtons';
import { isRazorpayConfigured } from '@/src/lib/payments/config';
import { PaymentUnavailable } from '@/src/components/customer/PaymentUnavailable';

export const dynamic = 'force-dynamic';

export default async function ExtensionPayPage(
  props: PageProps<'/booking/[bookingCode]/extend/[extensionId]/pay'>,
) {
  const { bookingCode, extensionId } = await props.params;
  const session = await requireCustomerSession(
    `/booking/${bookingCode}/extend/${extensionId}/pay`,
  );
  try {
    await requireCustomerOwnsBookingCode(session, bookingCode);
  } catch {
    notFound();
  }

  const result = await getExtensionDetail(extensionId);
  if (!result.ok) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Couldn&apos;t load extension
        </h1>
        <p className="mt-3 text-sm text-rose-700">{result.error}</p>
      </main>
    );
  }
  if (!result.data) notFound();
  const ext = result.data;
  if (ext.bookingCode !== bookingCode) notFound();

  // Already paid / cancelled — bounce to the parent booking page.
  if (ext.status !== 'pending') {
    redirect(`/booking/${ext.bookingCode}`);
  }

  const razorpayReady = isRazorpayConfigured();
  const totalLabel = paiseToInr(ext.quotedTotalPaise);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="text-xs text-zinc-500">
        <Link className="hover:text-zinc-900" href={`/booking/${ext.bookingCode}`}>
          {ext.bookingCode}
        </Link>
        <span className="mx-1">/</span>
        <Link
          className="hover:text-zinc-900"
          href={`/booking/${ext.bookingCode}/extend`}
        >
          Extend
        </Link>
        <span className="mx-1">/</span>
        <span className="text-zinc-900">Pay</span>
      </nav>

      <div className="mt-4 flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Pay for your extension
        </h1>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
          Awaiting payment
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-600">
        Extension for booking{' '}
        <span className="font-mono text-zinc-900">{ext.bookingCode}</span>{' '}
        — beds are held until you pay or the hold expires.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <section className="md:col-span-2 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Extension details
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-zinc-500">From</dt>
            <dd className="text-right text-zinc-900">{formatDate(ext.fromDate)}</dd>
            <dt className="text-zinc-500">Until (new check-out)</dt>
            <dd className="text-right text-zinc-900">
              {formatDate(ext.requestedUntilDate)}
            </dd>
            <dt className="text-zinc-500">Billing mode</dt>
            <dd className="text-right text-zinc-900">
              {titleCase(ext.extensionDurationMode)}
            </dd>
            <dt className="text-zinc-500">
              Bed{ext.bedCount === 1 ? '' : 's'}
            </dt>
            <dd className="text-right text-zinc-900">
              {ext.bedCodes.length > 0 ? ext.bedCodes.join(', ') : `${ext.bedCount} bed(s)`}
            </dd>
            {ext.holdExpiresAt ? (
              <>
                <dt className="text-zinc-500">Hold expires</dt>
                <dd className="text-right text-zinc-900">
                  {new Date(ext.holdExpiresAt).toLocaleString()}
                </dd>
              </>
            ) : null}
          </dl>
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Amount due
            </h2>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">Extension rent</span>
                <span className="text-zinc-900">{totalLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Deposit</span>
                <span className="text-zinc-900">already paid</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-zinc-100 pt-2 text-base font-semibold">
                <span className="text-zinc-900">Total</span>
                <span className="text-zinc-900">{totalLabel}</span>
              </div>
            </div>

            <div className="mt-5">
              {razorpayReady ? (
                <RazorpayExtensionCheckoutButton
                  extensionId={ext.id}
                  totalLabel={totalLabel}
                />
              ) : (
                <PaymentUnavailable />
              )}
            </div>

            <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
              Your original deposit stays in place — this payment covers additional
              rent only.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Changed your mind?
            </h2>
            <p className="mt-2 text-xs text-zinc-500">
              Cancelling releases the held beds back to availability. You
              can request the extension again any time.
            </p>
            <div className="mt-3">
              <CancelPendingExtensionForm extensionId={ext.id} />
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
