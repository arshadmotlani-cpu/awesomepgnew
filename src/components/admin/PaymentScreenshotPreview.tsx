'use client';

import { isDataProofUrl } from '@/src/lib/payments/proofResponse';
import {
  privateBlobRequiresProxy,
  resolveBlobImageDisplaySrc,
  resolveBlobLinkHref,
} from '@/src/lib/storage/blobImageDisplay';

export function PaymentScreenshotPreview({
  url,
  viewHref,
  alt = 'Payment screenshot',
  className = 'h-40 w-full max-w-xs rounded-lg border border-zinc-700 object-contain bg-black/40',
}: {
  url: string;
  /** Authenticated server route that streams private Blob / data-URL proofs. */
  viewHref?: string;
  alt?: string;
  className?: string;
}) {
  const displaySrc = resolveBlobImageDisplaySrc(url, viewHref);
  const fullSizeHref = resolveBlobLinkHref(url, viewHref);

  if (!displaySrc) {
    return (
      <p className="text-xs text-rose-300">
        {privateBlobRequiresProxy(url) && !viewHref
          ? 'Image requires an authenticated view URL.'
          : 'Image unavailable.'}
      </p>
    );
  }

  return (
    <div className="inline-block max-w-xs">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={displaySrc} alt={alt} className={className} />
      {fullSizeHref && !isDataProofUrl(url) ? (
        <a
          href={fullSizeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block text-xs text-[#FF5A1F] underline"
        >
          Open full size
        </a>
      ) : (
        <span className="mt-1 block text-xs text-zinc-500">Preview above</span>
      )}
    </div>
  );
}
