import sharp from 'sharp';

/** Keep compressed proofs under ~450 KB before Blob upload. */
export const MAX_PROOF_BYTES = 450_000;

export const PROOF_IMAGE_ERRORS = {
  corrupt:
    'This image looks damaged or incomplete. Open it in your gallery to confirm it loads, then upload again — or take a fresh payment screenshot.',
  unsupported:
    'This image format could not be processed. Save the payment screenshot as JPG or PNG and try again.',
  tooLarge:
    'Screenshot is too large. Take a closer crop or lower-resolution photo.',
  empty: 'The selected file is empty. Choose a different payment screenshot.',
  processing:
    'We could not process this image. Try a different screenshot or photo from your gallery.',
} as const;

const INTERNAL_IMAGE_ERROR_RE =
  /vips|libvips|sharp|mozjpeg|heif|heic|webp|pngload|jpegload|tiff|corrupt header|input buffer/i;

/** Map Sharp/libvips failures to resident-safe copy — never expose library internals. */
export function formatProofImageProcessingError(err: unknown): string {
  if (err instanceof Error) {
    const known = Object.values(PROOF_IMAGE_ERRORS);
    if (known.includes(err.message as (typeof PROOF_IMAGE_ERRORS)[keyof typeof PROOF_IMAGE_ERRORS])) {
      return err.message;
    }
  }

  const raw = err instanceof Error ? err.message : String(err ?? '');
  const lower = raw.toLowerCase();

  if (
    lower.includes('premature end') ||
    lower.includes('corrupt') ||
    lower.includes('truncated') ||
    lower.includes('invalid header') ||
    lower.includes('unexpected end') ||
    lower.includes('broken') ||
    lower.includes('bad seek')
  ) {
    return PROOF_IMAGE_ERRORS.corrupt;
  }

  if (
    lower.includes('heif') ||
    lower.includes('heic') ||
    lower.includes('unsupported') ||
    lower.includes('unknown format') ||
    lower.includes('unsupported image format')
  ) {
    return PROOF_IMAGE_ERRORS.unsupported;
  }

  if (INTERNAL_IMAGE_ERROR_RE.test(raw)) {
    return PROOF_IMAGE_ERRORS.processing;
  }

  return PROOF_IMAGE_ERRORS.processing;
}

/** Strip libvips/sharp internals if they leak through outer catch layers. */
export function sanitizePaymentUploadError(err: unknown): string {
  if (err instanceof Error) {
    const known = Object.values(PROOF_IMAGE_ERRORS);
    if (known.includes(err.message as (typeof PROOF_IMAGE_ERRORS)[keyof typeof PROOF_IMAGE_ERRORS])) {
      return err.message;
    }
    if (err.message === 'No file provided.' || err.message === 'Only screenshot images are allowed.') {
      return err.message;
    }
    if (err.message.startsWith('Payment proof upload is temporarily unavailable')) {
      return err.message;
    }
  }
  return formatProofImageProcessingError(err);
}

type CompressStep = 'decode_rotate_resize' | 'recompress';

async function runSharpCompress(buffer: Buffer, step: CompressStep): Promise<Buffer> {
  try {
    if (step === 'decode_rotate_resize') {
      return await sharp(buffer, { failOn: 'error', animated: false })
        .rotate()
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 72, mozjpeg: true })
        .toBuffer();
    }
    return await sharp(buffer, { failOn: 'error', animated: false })
      .jpeg({ quality: 52, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    throw new Error(formatProofImageProcessingError(err));
  }
}

/** Compress + normalize payment proof images to JPEG for storage. */
export async function compressPaymentProofImage(file: File): Promise<{ buffer: Buffer; mime: string }> {
  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    throw new Error(PROOF_IMAGE_ERRORS.corrupt);
  }

  if (buffer.length === 0) {
    throw new Error(PROOF_IMAGE_ERRORS.empty);
  }

  let compressed = await runSharpCompress(buffer, 'decode_rotate_resize');

  if (compressed.length > MAX_PROOF_BYTES) {
    compressed = await runSharpCompress(compressed, 'recompress');
  }

  if (compressed.length > MAX_PROOF_BYTES) {
    throw new Error(PROOF_IMAGE_ERRORS.tooLarge);
  }

  return { buffer: compressed, mime: 'image/jpeg' };
}
