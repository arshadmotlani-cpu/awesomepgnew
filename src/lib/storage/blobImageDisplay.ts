import { isDataProofUrl } from '@/src/lib/payments/proofResponse';
import { isPrivateBlobUrl } from '@/src/lib/storage/blob';

/**
 * Browser-safe image `src` for a stored blob path/URL.
 * Private Vercel Blob URLs must never be used directly — pass an authenticated proxy URL.
 */
export function resolveBlobImageDisplaySrc(
  storedUrl: string | null | undefined,
  proxyUrl?: string | null,
): string | null {
  const trimmed = storedUrl?.trim();
  if (!trimmed) {
    const proxy = proxyUrl?.trim();
    return proxy || null;
  }

  if (isPrivateBlobUrl(trimmed)) {
    return proxyUrl?.trim() || null;
  }

  if (isDataProofUrl(trimmed)) {
    return trimmed;
  }

  const proxy = proxyUrl?.trim();
  return proxy || trimmed;
}

/** Same rules as {@link resolveBlobImageDisplaySrc} for anchor `href`s. */
export function resolveBlobLinkHref(
  storedUrl: string | null | undefined,
  proxyUrl?: string | null,
): string | undefined {
  return resolveBlobImageDisplaySrc(storedUrl, proxyUrl) ?? undefined;
}

export function privateBlobRequiresProxy(storedUrl: string | null | undefined): boolean {
  const trimmed = storedUrl?.trim();
  return Boolean(trimmed && isPrivateBlobUrl(trimmed));
}
