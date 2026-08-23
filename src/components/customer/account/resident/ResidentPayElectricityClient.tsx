'use client';

import { ResidentPaymentConfirmFlow } from '@/src/components/customer/account/resident/ResidentPaymentConfirmFlow';

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function ResidentPayElectricityClient({
  invoiceId,
  amountLabel,
  confirmMessage,
  qrImageUrl,
  upiId,
  existingTransactionRef,
  rejectionReason,
  rejectionMessage,
  rejectedAt,
  backHref,
  residentId,
}: {
  invoiceId: string;
  amountLabel: string;
  confirmMessage: string;
  qrImageUrl?: string | null;
  upiId?: string | null;
  existingTransactionRef?: string | null;
  rejectionReason?: string | null;
  rejectionMessage?: string | null;
  rejectedAt?: Date | string | null;
  backHref: string;
  residentId?: string;
}) {
  return (
    <ResidentPaymentConfirmFlow
      confirmMessage={confirmMessage}
      amountLabel={amountLabel}
      instructions="Scan the QR, pay the exact amount due via UPI, then enter the transaction ID from your UPI app."
      qrImageUrl={qrImageUrl}
      upiId={upiId}
      existingTransactionRef={existingTransactionRef}
      rejectionReason={rejectionReason}
      rejectionMessage={rejectionMessage}
      rejectedAt={rejectedAt}
      logContext={{
        page: 'resident-pay-electricity',
        invoiceId,
        residentId,
        uploadType: 'electricity_payment',
      }}
      submitProof={async ({ screenshotUrl, transactionRef }) => {
        const res = await fetch(`/api/electricity-invoice/${invoiceId}/payment-proof`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentProofUrl: screenshotUrl ?? null,
            transactionRef,
          }),
        });
        const data = await safeJson<{ ok: boolean; message?: string }>(res);
        return { ok: Boolean(res.ok && data?.ok), message: data?.message ?? 'Request failed.' };
      }}
      successChecklist={[
        'Transaction ID saved on your electricity invoice',
        'Bill status will show as processing until verified',
        'Your wallet statement updates after approval',
      ]}
      backHref={backHref}
    />
  );
}
