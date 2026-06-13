import sharp from 'sharp';

export type KycImageKind = 'aadhaar_front' | 'aadhaar_back' | 'selfie';

export type ImageValidationResult =
  | {
      ok: true;
      width: number;
      height: number;
      bytes: number;
      blurScore: number;
      meanBrightness: number;
      ocrSignals?: string[];
    }
  | { ok: false; reason: string };

const MIN_BYTES = 12_000;
const MIN_AADHAAR_WIDTH = 480;
const MIN_AADHAAR_HEIGHT = 300;
const MIN_SELFIE_WIDTH = 240;
const MIN_SELFIE_HEIGHT = 240;
const MIN_BLUR_SCORE = 8;
const MIN_DOCUMENT_STDEV = 28;
const MIN_DOCUMENT_STDEV_FALLBACK = 22;
const MAX_MEAN_BRIGHTNESS = 248;
const MIN_MEAN_BRIGHTNESS = 18;

const AADHAAR_KEYWORDS = [
  'UIDAI',
  'GOVERNMENT',
  'INDIA',
  'AADHAAR',
  'AADHAR',
  'UNIQUE',
  'IDENTIFICATION',
  'आधार',
  'भारत',
];

const AADHAAR_NUMBER_RE = /\b\d{4}\s?\d{4}\s?\d{4}\b/;

/** Laplacian variance — higher = sharper. */
async function blurScore(buffer: Buffer): Promise<number> {
  const { data, info } = await sharp(buffer)
    .greyscale()
    .resize({ width: 320, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  let sum = 0;
  let sumSq = 0;
  let n = 0;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap =
        -4 * data[i] +
        data[i - 1] +
        data[i + 1] +
        data[i - w] +
        data[i + w];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function extractAsciiFromBuffer(buffer: Buffer): string {
  let text = '';
  for (let i = 0; i < buffer.length; i++) {
    const c = buffer[i];
    if (c >= 32 && c <= 126) text += String.fromCharCode(c);
    else text += ' ';
  }
  return text;
}

export function detectAadhaarOcrSignals(buffer: Buffer): string[] {
  const text = extractAsciiFromBuffer(buffer).toUpperCase();
  const signals: string[] = [];
  for (const kw of AADHAAR_KEYWORDS) {
    if (text.includes(kw.toUpperCase())) signals.push(kw);
  }
  if (AADHAAR_NUMBER_RE.test(text)) signals.push('aadhaar_number_pattern');
  return signals;
}

export async function validateKycImage(
  buffer: Buffer,
  kind: KycImageKind,
): Promise<ImageValidationResult> {
  if (!buffer.length || buffer.length < MIN_BYTES) {
    return { ok: false, reason: 'Image is blank or too small. Upload a clear photo.' };
  }

  let meta: sharp.Metadata;
  let stats: sharp.Stats;
  try {
    const img = sharp(buffer);
    meta = await img.metadata();
    stats = await img.stats();
  } catch {
    return { ok: false, reason: 'File is not a readable image.' };
  }

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width === 0 || height === 0) {
    return { ok: false, reason: 'Image has no dimensions — upload may be corrupt.' };
  }

  const isSelfie = kind === 'selfie';
  const minW = isSelfie ? MIN_SELFIE_WIDTH : MIN_AADHAAR_WIDTH;
  const minH = isSelfie ? MIN_SELFIE_HEIGHT : MIN_AADHAAR_HEIGHT;
  if (width < minW || height < minH) {
    return {
      ok: false,
      reason: `Image resolution is too low (${width}×${height}). Move closer or use a sharper camera.`,
    };
  }

  const meanBrightness = stats.channels[0]?.mean ?? 0;
  if (meanBrightness >= MAX_MEAN_BRIGHTNESS) {
    return { ok: false, reason: 'Image looks blank or overexposed.' };
  }
  if (meanBrightness <= MIN_MEAN_BRIGHTNESS) {
    return { ok: false, reason: 'Image is too dark to read.' };
  }

  const blur = await blurScore(buffer);
  if (blur < MIN_BLUR_SCORE) {
    return { ok: false, reason: 'Image is blurry or unreadable. Retake in good light.' };
  }

  const result: Extract<ImageValidationResult, { ok: true }> = {
    ok: true,
    width,
    height,
    bytes: buffer.length,
    blurScore: blur,
    meanBrightness,
  };

  if (kind === 'aadhaar_front' || kind === 'aadhaar_back') {
    const ocrSignals = detectAadhaarOcrSignals(buffer);
    const stdev = stats.channels[0]?.stdev ?? 0;
    // Printed cards / barcodes raise channel variance vs blank walls or single-color photos.
    if (stdev >= MIN_DOCUMENT_STDEV) ocrSignals.push('document_text_variance');

    const looksLikeDocumentPhoto =
      ocrSignals.length > 0 ||
      (stdev >= MIN_DOCUMENT_STDEV_FALLBACK && blur >= MIN_BLUR_SCORE);

    // Back side often lacks "AADHAAR" ASCII after phone JPEG compression — structure is enough.
    if (kind === 'aadhaar_back' && !looksLikeDocumentPhoto && stdev >= MIN_DOCUMENT_STDEV_FALLBACK) {
      ocrSignals.push('barcode_side_variance');
    }

    if (kind === 'aadhaar_front' && ocrSignals.length === 0 && stdev >= MIN_DOCUMENT_STDEV_FALLBACK && blur >= MIN_BLUR_SCORE) {
      ocrSignals.push('visual_document_fallback');
    }

    if (kind === 'aadhaar_front' && ocrSignals.length === 0) {
      return {
        ok: false,
        reason:
          'Photo does not look like an Aadhaar card. Use good light, hold the full card flat, and avoid blur or glare.',
      };
    }

    if (kind === 'aadhaar_back' && ocrSignals.length === 0) {
      return {
        ok: false,
        reason:
          'Photo does not look like the back of an Aadhaar card. Capture the address / barcode side clearly.',
      };
    }

    result.ocrSignals = ocrSignals;
  }

  return result;
}
