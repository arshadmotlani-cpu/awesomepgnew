import sharp from 'sharp';
import { isBlobPrivateConfigured, uploadPrivate } from '@/src/lib/storage/blob';

/** Keep compressed proofs under ~450 KB before Blob upload. */
const MAX_PROOF_BYTES = 450_000;

function onVercelProduction(): boolean {
  return process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
}

async function compressProof(file: File): Promise<{ buffer: Buffer; mime: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  let compressed = await sharp(buffer)
    .rotate()
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();

  if (compressed.length > MAX_PROOF_BYTES) {
    compressed = await sharp(compressed).jpeg({ quality: 52, mozjpeg: true }).toBuffer();
  }

  if (compressed.length > MAX_PROOF_BYTES) {
    throw new Error('Screenshot is too large. Take a closer crop or lower-resolution photo.');
  }

  return { buffer: compressed, mime: 'image/jpeg' };
}

/**
 * Store payment proof screenshots in Blob private storage on Vercel/production.
 * Local dev without Blob falls back to compressed data URLs for convenience.
 */
export async function uploadPaymentScreenshot(file: File): Promise<string> {
  if (!(file instanceof File)) throw new Error('No file provided.');
  if (!file.type.startsWith('image/')) {
    throw new Error('Only screenshot images are allowed.');
  }

  if (isBlobPrivateConfigured()) {
    const { buffer, mime } = await compressProof(file);
    const pathname = `payments/proofs/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
    const stored = await uploadPrivate(pathname, buffer, mime);
    return stored.url;
  }

  if (onVercelProduction()) {
    throw new Error(
      'Payment proof upload is temporarily unavailable. Please try again later or contact support.',
    );
  }

  const { buffer } = await compressProof(file);
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

export function isPaymentScreenshotUploadAvailable(): boolean {
  if (isBlobPrivateConfigured()) return true;
  if (onVercelProduction()) return false;
  return true;
}
