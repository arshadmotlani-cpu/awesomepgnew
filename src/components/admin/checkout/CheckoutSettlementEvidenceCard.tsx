'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Badge } from '@/src/components/admin/Badge';
import { resolveBlobImageDisplaySrc } from '@/src/lib/storage/blobImageDisplay';
import type { CheckoutSettlementImageEvidence } from '@/src/lib/checkout/checkoutSettlementImages';

export function CheckoutSettlementEvidenceCard({
  title,
  evidence,
  fallback,
}: {
  title: string;
  evidence: CheckoutSettlementImageEvidence;
  fallback: string;
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  const displaySrc = evidence.viewUrl
    ? resolveBlobImageDisplaySrc(evidence.storedUrl, evidence.viewUrl)
    : null;
  const showImage = Boolean(displaySrc) && evidence.fetchable && !loadFailed;
  const badgeTone =
    evidence.status === 'present' || evidence.status === 'alternative'
      ? 'emerald'
      : evidence.status === 'image_missing'
        ? 'rose'
        : 'amber';

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1A1F27] p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <Badge tone={badgeTone}>{loadFailed ? 'Image missing' : evidence.statusLabel}</Badge>
      </div>
      {showImage && displaySrc ? (
        <div className="relative mt-3 aspect-[4/3] overflow-hidden rounded-lg border border-white/10 bg-black/30">
          <Image
            src={displaySrc}
            alt={title}
            fill
            className="object-contain"
            unoptimized
            onError={() => setLoadFailed(true)}
          />
        </div>
      ) : (
        <p className="mt-3 text-sm text-apg-silver">
          {loadFailed
            ? 'Image could not be loaded. Ask the resident to re-upload.'
            : evidence.failureReason
              ? evidence.failureReason
              : fallback}
        </p>
      )}
    </div>
  );
}
