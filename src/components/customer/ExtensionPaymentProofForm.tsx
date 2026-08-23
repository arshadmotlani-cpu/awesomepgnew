'use client';

import { UpiPaymentProofForm } from './UpiPaymentProofForm';

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function ExtensionPaymentProofForm({
  extensionId,
  amountLabel,
  existingTransactionRef,
  qrImageUrl,
  upiId,
  rejectionReason,
  rejectionMessage,
}: {
  extensionId: string;
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
      heading="Pay extension via QR + transaction ID"
      instructions="Scan the rent / deposit QR, pay the extension amount via UPI, then enter the transaction ID from your UPI app."
      qrImageUrl={qrImageUrl}
      upiId={upiId}
      existingTransactionRef={existingTransactionRef}
      rejectionReason={rejectionReason}
      rejectionMessage={rejectionMessage}
      logContext={{ page: 'extension-payment', extensionId, uploadType: 'extension_payment' }}
      submitProof={async ({ screenshotUrl, transactionRef }) => {
        const res = await fetch(`/api/stay-extension/${extensionId}/payment-proof`, {
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
    />
  );
}
