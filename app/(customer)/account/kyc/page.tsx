import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { KycUploadForm } from '@/src/components/customer/KycUploadForm';
import { db } from '@/src/db/client';
import { bookings } from '@/src/db/schema';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { canCheckIn, getCustomerById } from '@/src/services/profile';
import { getLatestKycSubmission } from '@/src/services/kyc';
import { titleCase } from '@/src/lib/format';
import { ElectricityMeterNotice } from '@/src/components/customer/ElectricityMeterNotice';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'KYC verification' };

export default async function KycPage(props: PageProps<'/account/kyc'>) {
  const session = await requireCustomerSession('/account/kyc');
  const customer = await getCustomerById(session.customerId);
  if (!customer) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <p className="text-sm text-rose-700">Account not found.</p>
      </main>
    );
  }

  const sp = await props.searchParams;
  const bookingCode = typeof sp.booking === 'string' ? sp.booking : undefined;
  const submitted = sp.submitted === '1';
  const latest = await getLatestKycSubmission(session.customerId);
  const checkInOk = canCheckIn(customer);
  const [confirmedBooking] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.customerId, session.customerId),
        eq(bookings.status, 'confirmed'),
      ),
    )
    .limit(1);
  const hasConfirmedBooking = Boolean(confirmedBooking);
  const kycForCheckIn = Boolean(bookingCode || hasConfirmedBooking);
  const awaitingReview =
    customer.kycStatus === 'pending' &&
    latest != null &&
    latest.status === 'pending';

  const statusTone =
    customer.kycStatus === 'approved'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : customer.kycStatus === 'rejected'
        ? 'border-rose-200 bg-rose-50 text-rose-900'
        : 'border-amber-200 bg-amber-50 text-amber-900';

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <nav className="text-xs text-zinc-500">
        <Link href="/account/bookings" className="hover:text-indigo-600">
          My bookings
        </Link>
        <span className="mx-1">/</span>
        <span className="text-zinc-700">KYC</span>
      </nav>

      <header className="mt-4">
        <h1 className="text-2xl font-semibold text-zinc-900">Identity verification</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Upload your Aadhaar and a selfie. An admin will review before you can check in.
        </p>
      </header>

      {kycForCheckIn && customer.kycStatus !== 'approved' ? (
        <div className="mt-4">
          <ElectricityMeterNotice variant="checkin" />
        </div>
      ) : null}

      <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${statusTone}`}>
        <p className="font-semibold">Status: {titleCase(customer.kycStatus)}</p>
        {customer.kycStatus === 'approved' ? (
          <p className="mt-1">You&apos;re cleared for check-in.</p>
        ) : customer.kycStatus === 'pending' && latest ? (
          <p className="mt-1">
            Documents under review. Our team is reviewing your documents.
            You&apos;ll receive an update once verification is complete.
          </p>
        ) : customer.kycStatus === 'pending' ? (
          <p className="mt-1">
            {kycForCheckIn
              ? 'Upload your Aadhaar and selfie below before check-in.'
              : 'Upload your documents when you have a confirmed booking and are ready to check in.'}
          </p>
        ) : (
          <p className="mt-1">
            {latest?.rejectionReason
              ? `Rejected: ${latest.rejectionReason}. Please resubmit clear photos.`
              : 'Please resubmit your documents.'}
          </p>
        )}
      </div>

      {submitted && customer.kycStatus === 'pending' ? (
        <p className="mt-3 rounded-md bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
          Documents submitted. We&apos;ll notify you once reviewed.
        </p>
      ) : null}

      {bookingCode && !checkInOk ? (
        <p className="mt-3 text-sm text-zinc-600">
          Complete KYC for booking{' '}
          <span className="font-mono font-medium text-zinc-900">{bookingCode}</span>.
        </p>
      ) : null}

      {customer.kycStatus === 'approved' ? (
        <p className="mt-6 text-sm text-zinc-500">
          No further action needed.{' '}
          <Link href="/account/bookings" className="font-medium text-indigo-600 hover:underline">
            View bookings
          </Link>
        </p>
      ) : awaitingReview ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
          <p className="font-semibold text-zinc-900">Documents already submitted</p>
          <p className="mt-1">
            Submitted{' '}
            {latest!.createdAt.toLocaleString('en-IN', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
            . Our team is reviewing your Aadhaar and selfie — you don&apos;t need to upload again
            unless we reject them.
          </p>
          <Link
            href="/account/bookings"
            className="mt-3 inline-block font-medium text-indigo-600 hover:underline"
          >
            View bookings →
          </Link>
        </div>
      ) : (
        <KycUploadForm bookingCode={bookingCode} />
      )}
    </main>
  );
}
