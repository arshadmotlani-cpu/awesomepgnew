'use client';

import { UpiPaymentProofForm } from './UpiPaymentProofForm';
import { submitPaymentLinkProofAction } from '@/app/(customer)/pay/actions';

export function PaymentLinkProofForm({
  linkId,
  amountLabel,
  qrImageUrl,
  existingTransactionRef,
  rejectionReason,
  rejectionMessage,
  title,
}: {
  linkId: string;
  amountLabel: string;
  qrImageUrl?: string | null;
  existingTransactionRef?: string | null;
  rejectionReason?: string | null;
  rejectionMessage?: string | null;
  title?: string | null;
}) {
  return (
    <UpiPaymentProofForm
      amountLabel={amountLabel}
      heading={title ? `Pay: ${title}` : 'Pay via QR + transaction ID'}
      instructions="Scan the QR, pay the exact amount via UPI, then enter the transaction ID from your UPI app."
      qrImageUrl={qrImageUrl}
      existingTransactionRef={existingTransactionRef}
      rejectionReason={rejectionReason}
      rejectionMessage={rejectionMessage}
      logContext={{ page: 'payment-link', paymentLinkId: linkId }}
      submitProof={async ({ screenshotUrl, transactionRef }) => {
        const result = await submitPaymentLinkProofAction(linkId, {
          transactionRef,
          paymentProofUrl: screenshotUrl ?? null,
        });
        return { ok: result.ok, message: result.ok ? undefined : result.message };
      }}
    />
  );
}
