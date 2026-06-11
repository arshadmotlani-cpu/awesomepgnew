'use client';

import { isDataProofUrl } from '@/src/lib/payments/proofResponse';

export function PaymentScreenshotPreview({
  url,
  viewHref,
  alt = 'Payment screenshot',
  className = 'h-40 w-full max-w-xs rounded-lg border border-zinc-700 object-contain bg-black/40',
}: {
  url: string;
  /** Use for data-URL proofs — opens a server route that streams the image. */
  viewHref?: string;
  alt?: string;
  className?: string;
}) {
  const fullSizeHref =
    viewHref ?? (isDataProofUrl(url) ? undefined : url);

  return (
    <div className="inline-block max-w-xs">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className={className} />
      {fullSizeHref ? (
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
