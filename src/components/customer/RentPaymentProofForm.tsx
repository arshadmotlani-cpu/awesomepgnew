'use client';

import { UpiPaymentProofForm } from './UpiPaymentProofForm';

export function RentPaymentProofForm({
  invoiceId,
  amountLabel,
  existingTransactionRef,
  qrImageUrl,
  upiId,
  rejectionReason,
  rejectionMessage,
}: {
  invoiceId: string;
  amountLabel: string;
  existingTransactionRef?: string | null;
  qrImageUrl?: string | null;
  upiId?: string | null;
  rejectionReason?: string | null;
  rejectionMessage?: string | null;
}) {
  return (
    <UpiPaymentProofForm
      amountLabel={amountLabel}
      instructions="Scan the rent / deposit QR, pay the exact amount due via UPI, then enter the transaction ID from your UPI app."
      qrImageUrl={qrImageUrl}
      upiId={upiId}
      existingTransactionRef={existingTransactionRef}
      rejectionReason={rejectionReason}
      rejectionMessage={rejectionMessage}
      logContext={{ page: 'rent-payment', invoiceId, uploadType: 'payment_proof' }}
      submitProof={async ({ screenshotUrl, transactionRef }) => {
        const res = await fetch(`/api/rent-invoice/${invoiceId}/payment-proof`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentProofUrl: screenshotUrl ?? null,
            transactionRef,
          }),
        });
        const data = (await res.json()) as { ok: boolean; message?: string };
        return { ok: res.ok && data.ok, message: data.message };
      }}
    />
  );
}
