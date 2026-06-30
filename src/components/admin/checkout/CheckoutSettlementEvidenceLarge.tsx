'use client';

import Image from 'next/image';
import { useState } from 'react';
import { resolveBlobImageDisplaySrc } from '@/src/lib/storage/blobImageDisplay';
import type { CheckoutSettlementImageEvidence } from '@/src/lib/checkout/checkoutSettlementImages';

export function CheckoutSettlementEvidenceLarge({
  title,
  evidence,
  emptyLabel,
}: {
  title: string;
  evidence: CheckoutSettlementImageEvidence;
  emptyLabel: string;
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  const displaySrc = evidence.viewUrl
    ? resolveBlobImageDisplaySrc(evidence.storedUrl, evidence.viewUrl)
    : null;
  const showImage = Boolean(displaySrc) && evidence.fetchable && !loadFailed;

  return (
    <div className="overflow-hidden rounded-3xl bg-[#1A1F27]/90 ring-1 ring-white/[0.06]">
      <div className="border-b border-white/[0.06] px-6 py-4">
        <h3 className="text-sm font-medium text-apg-silver">{title}</h3>
      </div>
      <div className="p-4">
        {showImage && displaySrc ? (
          <div className="relative mx-auto min-h-[280px] w-full max-w-lg overflow-hidden rounded-2xl bg-black/40 sm:min-h-[360px]">
            <Image
              src={displaySrc}
              alt={title}
              fill
              className="object-contain p-2"
              unoptimized
              onError={() => setLoadFailed(true)}
            />
          </div>
        ) : (
          <div className="flex min-h-[200px] items-center justify-center rounded-2xl bg-black/20 px-6 py-12 text-center">
            <p className="text-sm text-apg-silver">
              {loadFailed
                ? 'Image could not be loaded. Ask the resident to re-upload.'
                : evidence.failureReason ?? emptyLabel}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
