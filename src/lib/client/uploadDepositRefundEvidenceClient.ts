'use client';

import { prepareProofImageForUpload } from '@/src/lib/payments/clientProofImagePrep';
import { uploadPaymentScreenshotClient } from '@/src/lib/client/uploadPaymentScreenshotClient';

export type DepositRefundEvidenceUploadType = 'meter_photo' | 'refund_qr';

export type DepositRefundEvidenceUploadPhase = 'preparing' | 'uploading';

export type DepositRefundEvidenceUploadResult = {
  url: string;
  originalBytes: number;
  uploadBytes: number;
  wasProcessed: boolean;
};

/**
 * Prepare + upload deposit-refund evidence via API route (not Server Action).
 * Avoids RSC refresh and sends a compressed JPEG instead of a full camera original.
 */
export async function uploadDepositRefundEvidenceClient(
  file: File,
  input: { uploadType: DepositRefundEvidenceUploadType; bookingId: string },
  onPhase?: (phase: DepositRefundEvidenceUploadPhase) => void,
): Promise<DepositRefundEvidenceUploadResult> {
  onPhase?.('preparing');
  const prepared = await prepareProofImageForUpload(file);

  onPhase?.('uploading');
  const formData = new FormData();
  formData.set('file', prepared.file);
  formData.set('uploadType', input.uploadType);
  formData.set('bookingId', input.bookingId);

  const url = await uploadPaymentScreenshotClient(formData);

  return {
    url,
    originalBytes: prepared.originalBytes,
    uploadBytes: prepared.outputBytes,
    wasProcessed: prepared.wasProcessed,
  };
}
