import { isBlobPrivateConfigured, uploadPrivate } from '@/src/lib/storage/blob';
import {
  compressPaymentProofImage,
  sanitizePaymentUploadError,
} from '@/src/lib/payments/proofImageProcessing';
import {
  recordResidentUpload,
  type ResidentUploadTraceInput,
} from '@/src/services/residentUploadEvents';

function onVercelProduction(): boolean {
  return process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
}

/**
 * Store payment proof screenshots in Blob private storage on Vercel/production.
 * Local dev without Blob falls back to compressed data URLs for convenience.
 */
export async function uploadPaymentScreenshot(
  file: File,
  trace?: ResidentUploadTraceInput,
): Promise<string> {
  if (!(file instanceof File)) throw new Error('No file provided.');
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
    throw new Error('Only screenshot images are allowed.');
  }

  try {
    if (isBlobPrivateConfigured()) {
      const { buffer, mime } = await compressPaymentProofImage(file);
      const pathname = `payments/proofs/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
      const stored = await uploadPrivate(pathname, buffer, mime);
      if (trace) {
        await recordResidentUpload({ ...trace, storagePath: stored.url }).catch(() => undefined);
      }
      return stored.url;
    }

    if (onVercelProduction()) {
      throw new Error(
        'Payment proof upload is temporarily unavailable. Please try again later or contact support.',
      );
    }

    const { buffer } = await compressPaymentProofImage(file);
    const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    if (trace) {
      await recordResidentUpload({ ...trace, storagePath: dataUrl }).catch(() => undefined);
    }
    return dataUrl;
  } catch (err) {
    throw new Error(sanitizePaymentUploadError(err));
  }
}

export function isPaymentScreenshotUploadAvailable(): boolean {
  if (isBlobPrivateConfigured()) return true;
  if (onVercelProduction()) return false;
  return true;
}
