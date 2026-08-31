import { randomUUID } from 'crypto';
import { isBlobPublicConfigured, uploadPublic } from '@/src/lib/storage/blob';

const MAX_QR_BYTES = 800_000;
const MAX_INLINE_DATA_URL_CHARS = 120_000;

function parseDataUrl(dataUrl: string): { contentType: string; buffer: Buffer } | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  const buffer = Buffer.from(match[2]!.replace(/\s/g, ''), 'base64');
  return { contentType: match[1]!.toLowerCase(), buffer };
}

function extensionForImageType(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  return 'jpg';
}

/** Store QR images as blob URLs when configured; otherwise keep small inline data URLs. */
export async function persistEmployeeQrCodeUrl(raw: string | null | undefined): Promise<string | null> {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('data:')) return trimmed;

  const parsed = parseDataUrl(trimmed);
  if (!parsed) throw new Error('QR code must be a valid image file.');
  if (parsed.buffer.length > MAX_QR_BYTES) {
    throw new Error('QR code image must be under 800KB.');
  }

  if (!isBlobPublicConfigured()) {
    if (trimmed.length > MAX_INLINE_DATA_URL_CHARS) {
      throw new Error(
        'QR code image is too large for inline storage. Use a smaller image or configure cloud storage.',
      );
    }
    return trimmed;
  }

  const ext = extensionForImageType(parsed.contentType);
  const stored = await uploadPublic(`fyh/workforce/qr/${randomUUID()}.${ext}`, parsed.buffer, parsed.contentType);
  return stored.url;
}

export async function persistEmployeeQrFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('QR code must be an image file.');
  }
  if (file.size > MAX_QR_BYTES) {
    throw new Error('QR code image must be under 800KB.');
  }

  if (!isBlobPublicConfigured()) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type};base64,${buffer.toString('base64')}`;
    if (dataUrl.length > MAX_INLINE_DATA_URL_CHARS) {
      throw new Error(
        'QR code image is too large for inline storage. Use a smaller image or configure cloud storage.',
      );
    }
    return dataUrl;
  }

  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '.jpg';
  const stored = await uploadPublic(
    `fyh/workforce/qr/${randomUUID()}${ext}`,
    file,
    file.type || undefined,
  );
  return stored.url;
}
