import { randomUUID } from 'crypto';
import { isBlobPublicConfigured, uploadPublic } from '@/src/lib/storage/blob';

const MAX_PHOTO_BYTES = 1_500_000;

function extensionForImageType(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  return 'jpg';
}

/** Store attendance selfie evidence as a public blob URL when configured. */
export async function persistAttendancePhotoFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Attendance photo must be an image file.');
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error('Attendance photo must be under 1.5MB.');
  }

  if (!isBlobPublicConfigured()) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type};base64,${buffer.toString('base64')}`;
    if (dataUrl.length > 200_000) {
      throw new Error(
        'Attendance photo is too large for inline storage. Configure cloud storage or use a smaller image.',
      );
    }
    return dataUrl;
  }

  const ext = extensionForImageType(file.type);
  const stored = await uploadPublic(
    `fyh/workforce/attendance/${randomUUID()}.${ext}`,
    file,
    file.type || undefined,
  );
  return stored.url;
}
