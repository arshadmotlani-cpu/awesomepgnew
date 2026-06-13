import Link from 'next/link';
import { KycUploadForm } from '@/src/components/customer/KycUploadForm';
import type { Customer } from '@/src/db/schema/customers';
import { canCheckIn, getCustomerById } from '@/src/services/profile';
import { getLatestKycSubmission } from '@/src/services/kyc';
import { getCustomerKycUploadContext } from '@/src/services/kycEligibility';
import { titleCase } from '@/src/lib/format';
import { isKycUploadAvailable } from '@/src/lib/kyc/storage';
import { ElectricityMeterNotice } from '@/src/components/customer/ElectricityMeterNotice';
import {
  ACCOUNT_LINK_IN_SURFACE,
  ACCOUNT_LINK_ON_DARK,
  ACCOUNT_SURFACE_PADDED,
} from '@/src/components/customer/accountStyles';
import { accountProfileHref } from '@/src/lib/accountNavigation';

type Props = {
  customerId: string;
  bookingCode?: string;
  submitted?: boolean;
};

export async function KycIdentitySection({
  customerId,
  bookingCode,
  submitted = false,
}: Props) {
  const customer = await getCustomerById(customerId);
  if (!customer) {
    return (
      <p className="mt-6 text-sm text-rose-700">Account not found.</p>
    );
  }

  const latest = await getLatestKycSubmission(customerId);
  const checkInOk = canCheckIn(customer);
  const kycCtx = await getCustomerKycUploadContext(customerId, bookingCode);
  const awaitingReview =
    customer.kycStatus === 'pending' &&
    latest != null &&
    latest.status === 'pending';
  const kycUploadAvailable = isKycUploadAvailable();

  const statusTone =
    customer.kycStatus === 'approved'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : customer.kycStatus === 'rejected'
        ? 'border-rose-200 bg-rose-50 text-rose-900'
        : 'border-amber-200 bg-amber-50 text-amber-900';

  function pendingStatusMessage(): string {
    if (awaitingReview) {
      return 'Documents under review. Our team is reviewing your Aadhaar and selfie — you will receive an update once verification is complete.';
    }
    if (kycCtx.hasActiveTenancy || kycCtx.hasConfirmedBooking) {
      return 'Upload your Aadhaar and selfie below. Admin reviews from the KYC queue before check-in.';
    }
    if (kycCtx.hasPendingPaymentBooking) {
      return 'Upload your documents now while payment is processed — admin will review and approve from the KYC panel.';
    }
    return 'Upload your Aadhaar and selfie below. Admin will review your submission in the KYC queue.';
  }

  return (
    <section className="mt-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Identity verification (KYC)</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Upload your Aadhaar and a selfie. Your selfie becomes your private profile photo — only
          you and Awesome PG admin can see it. An admin reviews before check-in.
        </p>
      </div>

      {kycCtx.kycForCheckIn && customer.kycStatus !== 'approved' ? (
        <ElectricityMeterNotice variant="checkin" />
      ) : null}

      <div className={`rounded-lg border px-4 py-3 text-sm ${statusTone}`}>
        <p className="font-semibold">Status: {titleCase(customer.kycStatus)}</p>
        {customer.kycStatus === 'approved' ? (
          <p className="mt-1">You&apos;re cleared for check-in.</p>
        ) : customer.kycStatus === 'pending' && latest ? (
          <p className="mt-1">{pendingStatusMessage()}</p>
        ) : customer.kycStatus === 'pending' ? (
          <p className="mt-1">{pendingStatusMessage()}</p>
        ) : (
          <p className="mt-1">
            {latest?.rejectionReason
              ? `Rejected: ${latest.rejectionReason}. Please resubmit clear photos.`
              : 'Please resubmit your documents.'}
          </p>
        )}
      </div>

      {submitted && customer.kycStatus === 'pending' ? (
        <p className="rounded-md bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
          Documents submitted. We&apos;ll notify you once reviewed.
        </p>
      ) : null}

      {bookingCode && !checkInOk ? (
        <p className="text-sm text-apg-silver">
          Complete KYC for booking{' '}
          <span className="font-mono font-semibold text-white">{bookingCode}</span>.
        </p>
      ) : null}

      {customer.kycStatus === 'approved' ? (
        <div className={`${ACCOUNT_SURFACE_PADDED} space-y-3 text-sm text-zinc-800`}>
          <p className="font-semibold text-zinc-900">Verification complete</p>
          {latest ? (
            <KycDocumentPreview customer={customer} submissionId={latest.id} />
          ) : null}
          <Link href="/account/bookings" className={`font-medium ${ACCOUNT_LINK_IN_SURFACE}`}>
            View bookings →
          </Link>
        </div>
      ) : awaitingReview ? (
        <div className={`${ACCOUNT_SURFACE_PADDED} text-sm text-zinc-800`}>
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
          <KycDocumentPreview customer={customer} submissionId={latest!.id} className="mt-4" />
          <Link
            href={accountProfileHref('resident')}
            className={`mt-3 inline-block font-medium ${ACCOUNT_LINK_IN_SURFACE}`}
          >
            Go to resident area →
          </Link>
        </div>
      ) : (
        <>
          {latest && customer.kycStatus === 'rejected' ? (
            <KycDocumentPreview customer={customer} submissionId={latest.id} />
          ) : null}
          <KycUploadForm bookingCode={bookingCode} uploadAvailable={kycUploadAvailable} />
        </>
      )}
    </section>
  );
}

function KycDocumentPreview({
  customer,
  submissionId,
  className = '',
}: {
  customer: Customer;
  submissionId: string;
  className?: string;
}) {
  const docUrl = (kind: 'aadhaar_front' | 'aadhaar_back' | 'selfie') =>
    `/api/kyc/documents/${submissionId}/${kind}`;

  return (
    <div className={`${ACCOUNT_SURFACE_PADDED} ${className}`.trim()}>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Your submitted documents
      </p>
      <p className="mt-1 text-xs text-zinc-600">
        Private — only you and admin can view these. Selfie is also your profile photo.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <DocThumb label="Aadhaar front" href={docUrl('aadhaar_front')} />
        <DocThumb label="Aadhaar back" href={docUrl('aadhaar_back')} />
        <DocThumb label="Selfie (profile photo)" href={docUrl('selfie')} highlight />
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        KYC status: {titleCase(customer.kycStatus)}
        {customer.kycStatus === 'rejected' ? (
          <>
            {' '}
            ·{' '}
            <Link href={accountProfileHref('identity')} className={ACCOUNT_LINK_ON_DARK}>
              Resubmit below
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}

function DocThumb({
  label,
  href,
  highlight = false,
}: {
  label: string;
  href: string;
  highlight?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        'block overflow-hidden rounded-lg border bg-zinc-50 ' +
        (highlight ? 'border-apg-orange/40 ring-1 ring-apg-orange/20' : 'border-zinc-200')
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={href} alt="" className="aspect-[4/3] w-full object-cover" />
      <p className="px-2 py-1.5 text-[11px] font-medium text-zinc-700">{label}</p>
    </a>
  );
}
