'use client';

import Link from 'next/link';
import { customerPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import { UpiPaymentProofForm } from './UpiPaymentProofForm';

type Props = {
  bookingCode: string;
  pgName: string;
  totalPaise: number;
  totalLabel: string;
  qrImageUrl: string;
  upiId: string | null;
  uploadScreenshot: (formData: FormData) => Promise<string>;
  /** Optional PS4 add-on — combined checkout total, separate records. */
  membershipId?: string;
  membershipAmountPaise?: number;
  membershipLabel?: string;
  bookingAmountPaise?: number;
  /** When proof is already pending admin review. */
  existingProofRecordId?: string | null;
};

export function BookingQrCheckout({
  bookingCode,
  pgName,
  totalPaise,
  totalLabel,
  qrImageUrl,
  upiId,
  uploadScreenshot,
  membershipId,
  membershipAmountPaise,
  membershipLabel,
  bookingAmountPaise,
  existingProofRecordId,
}: Props) {
  const breakdown =
    membershipLabel && bookingAmountPaise != null && membershipAmountPaise
      ? ` Includes ${membershipLabel} PS4 add-on — bed/deposit and PS4 are separate records, one UPI payment.`
      : '';

  if (existingProofRecordId) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Payment proof received — booking{' '}
          <span className="font-mono font-medium">{bookingCode}</span> is confirmed once admin
          verifies your UPI payment (usually within a few hours).
        </div>
        <a
          href={customerPaymentProofViewUrl('booking', existingProofRecordId)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-[#FF5A1F] hover:underline"
        >
          View uploaded screenshot →
        </a>
        <Link
          href={`/booking/${bookingCode}`}
          className="block text-sm font-semibold text-zinc-700 underline"
        >
          View booking status →
        </Link>
      </div>
    );
  }

  return (
    <UpiPaymentProofForm
      variant="light"
      amountLabel={totalLabel}
      heading="Pay via UPI QR + upload proof"
      instructions={`Scan the QR, pay the exact amount for ${pgName}, then upload your payment screenshot.${breakdown}`}
      qrImageUrl={qrImageUrl}
      upiId={upiId}
      qrFootnote="Rent, deposit & booking · use the electricity QR when your checkout includes a PS4 add-on"
      uploadScreenshot={uploadScreenshot}
      proofViewHref={
        existingProofRecordId
          ? customerPaymentProofViewUrl('booking', existingProofRecordId)
          : undefined
      }
      doneMessage={`Payment proof submitted for ${totalLabel}. An admin will verify your UPI payment and confirm booking ${bookingCode}.`}
      submitProof={async ({ screenshotUrl, transactionRef }) => {
        const res = await fetch('/api/payment-record/booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingCode,
            amountPaise: totalPaise,
            paymentScreenshotUrl: screenshotUrl,
            transactionRef: transactionRef || undefined,
            membershipId,
            membershipAmountPaise,
          }),
        });
        const data = (await res.json()) as { ok: boolean; message?: string };
        return { ok: res.ok && data.ok, message: data.message };
      }}
    />
  );
}
