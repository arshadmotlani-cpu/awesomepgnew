import Link from 'next/link';
import { accountProfileHref } from '@/src/lib/accountNavigation';

type Props = {
  kycStatus: 'pending' | 'approved' | 'rejected';
  bookingCode?: string;
  documentsSubmitted?: boolean;
};

export function KycCheckInBanner({
  kycStatus,
  bookingCode,
  documentsSubmitted = false,
}: Props) {
  if (kycStatus === 'approved') return null;

  const tone =
    kycStatus === 'rejected'
      ? 'border-rose-200 bg-rose-50 text-rose-900'
      : documentsSubmitted
        ? 'border-indigo-200 bg-indigo-50 text-indigo-900'
        : 'border-amber-200 bg-amber-50 text-amber-900';

  const href = accountProfileHref('identity', { booking: bookingCode });

  const headline =
    kycStatus === 'rejected'
      ? 'Identity verification needs attention'
      : documentsSubmitted
        ? 'Documents under review'
        : 'Identity verification required';

  const body =
    kycStatus === 'rejected'
      ? 'Your documents were rejected. Please resubmit clear photos of your Aadhaar and selfie.'
      : documentsSubmitted
        ? "Our team is reviewing your documents. You'll receive an update once verification is complete."
        : 'Upload your Aadhaar and a selfie before check-in. Verification usually takes 24–48 hours.';

  const ctaLabel =
    kycStatus === 'rejected'
      ? 'Resubmit documents'
      : documentsSubmitted
        ? 'View verification status'
        : 'Complete identity verification';

  return (
    <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${tone}`}>
      <p className="font-semibold">{headline}</p>
      <p className="mt-1">{body}</p>
      <Link href={href} className="mt-2 inline-block font-semibold text-indigo-700 hover:underline">
        {ctaLabel} →
      </Link>
    </div>
  );
}
