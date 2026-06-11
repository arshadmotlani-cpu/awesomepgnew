import sharp from 'sharp';
import { isCloudinaryConfigured, uploadToCloudinary } from '@/src/lib/images/cloudinary';

/** Keep data-URL proofs under ~450 KB for Postgres text columns. */
const MAX_PROOF_BYTES = 450_000;

/**
 * Store payment proof screenshots — Cloudinary when configured, otherwise a
 * compressed JPEG data URL (works on Vercel without extra services).
 */
export async function uploadPaymentScreenshot(file: File): Promise<string> {
  if (!(file instanceof File)) throw new Error('No file provided.');
  if (!file.type.startsWith('image/')) {
    throw new Error('Only screenshot images are allowed.');
  }

  if (isCloudinaryConfigured()) {
    return uploadToCloudinary(file);
  }

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

  return `data:image/jpeg;base64,${compressed.toString('base64')}`;
}

export function isPaymentScreenshotUploadAvailable(): boolean {
  return true;
}
