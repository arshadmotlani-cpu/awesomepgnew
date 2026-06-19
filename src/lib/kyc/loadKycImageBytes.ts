import { getPrivate, isPrivateBlobUrl } from '@/src/lib/storage/blob';
import { KycStorageError } from '@/src/lib/kyc/errors';
import { isRemoteKycUrl, readKycFileBytes } from '@/src/lib/kyc/storage';

/** Load KYC image bytes from filesystem, private Blob, or legacy HTTPS URL. */
export async function loadKycImageBytes(
  storedPath: string,
  mimeHint?: string | null,
): Promise<{ buffer: Buffer; mime: string }> {
  const trimmed = storedPath.trim();
  if (!trimmed) {
    throw new KycStorageError('READ_FAILED', 'KYC file path is empty.');
  }

  if (isPrivateBlobUrl(trimmed)) {
    const { stream, contentType } = await getPrivate(trimmed);
    const buffer = Buffer.from(await new Response(stream).arrayBuffer());
    return { buffer, mime: mimeHint ?? contentType ?? 'image/jpeg' };
  }

  if (isRemoteKycUrl(trimmed)) {
    const res = await fetch(trimmed, { cache: 'no-store' });
    if (!res.ok) {
      throw new KycStorageError('READ_FAILED', 'KYC file missing.');
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const mime = mimeHint ?? res.headers.get('content-type')?.split(';')[0]?.trim() ?? 'image/jpeg';
    return { buffer, mime };
  }

  return readKycFileBytes(trimmed, mimeHint);
}
