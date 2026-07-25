'use client';

import Image from 'next/image';
import { useState } from 'react';
import { resolveBlobImageDisplaySrc } from '@/src/lib/storage/blobImageDisplay';
import type { CheckoutSettlementImageEvidence } from '@/src/lib/checkout/checkoutSettlementImages';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

type DetailEvidence = Pick<
  CheckoutSettlementDetail,
  'meterPhotoEvidence' | 'refundQrEvidence' | 'meterPhotoMissing' | 'payoutUpiId'
>;

function EvidenceTile({
  title,
  evidence,
  emptyLabel,
  compact,
}: {
  title: string;
  evidence: CheckoutSettlementImageEvidence;
  emptyLabel: string;
  compact?: boolean;
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  const displaySrc = evidence.viewUrl
    ? resolveBlobImageDisplaySrc(evidence.storedUrl, evidence.viewUrl)
    : null;
  const showImage = Boolean(displaySrc) && evidence.fetchable && !loadFailed;
  const openHref = showImage && displaySrc ? displaySrc : evidence.viewUrl;

  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-white/[0.08] bg-[#12161C]/80">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-apg-silver">{title}</h4>
        {openHref && showImage ? (
          <a
            href={openHref}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs font-semibold text-[#FF5A1F] hover:underline"
          >
            Open
          </a>
        ) : null}
      </div>
      <div className={compact ? 'p-2' : 'p-4'}>
        {showImage && displaySrc ? (
          <a
            href={openHref ?? displaySrc}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
            title={`Open ${title}`}
          >
            <div
              className={
                'relative w-full overflow-hidden rounded-xl bg-black/40 ' +
                (compact ? 'aspect-[4/3] max-h-[140px]' : 'min-h-[200px] max-h-[360px]')
              }
            >
              <Image
                src={displaySrc}
                alt={title}
                fill
                className="object-contain p-1"
                unoptimized
                onError={() => setLoadFailed(true)}
              />
            </div>
          </a>
        ) : (
          <p className="py-6 text-center text-xs text-apg-silver">
            {loadFailed
              ? 'Image could not be loaded — ask resident to re-upload.'
              : evidence.failureReason ?? emptyLabel}
          </p>
        )}
      </div>
    </div>
  );
}

/** Inline meter + refund proof for checkout steps 2–4 (no navigation away). */
export function CheckoutSettlementResidentEvidenceStrip({ detail }: { detail: DetailEvidence }) {
  return (
    <section
      aria-label="Resident submission evidence"
      className="grid gap-3 sm:grid-cols-2"
    >
      <EvidenceTile
        title="Meter photo"
        evidence={detail.meterPhotoEvidence}
        emptyLabel={
          detail.meterPhotoMissing
            ? 'Resident marked meter photo as missing'
            : 'Meter photo not uploaded yet'
        }
        compact
      />
      <EvidenceTile
        title="Refund QR / UPI"
        evidence={detail.refundQrEvidence}
        emptyLabel={
          detail.payoutUpiId?.trim()
            ? `UPI ID only: ${detail.payoutUpiId}`
            : 'Refund QR not uploaded yet'
        }
        compact
      />
    </section>
  );
}

export function CheckoutSettlementResidentEvidenceLarge({ detail }: { detail: DetailEvidence }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <EvidenceTile
        title="Meter photo"
        evidence={detail.meterPhotoEvidence}
        emptyLabel={
          detail.meterPhotoMissing
            ? 'Resident marked meter photo as missing'
            : 'Meter photo not uploaded yet'
        }
      />
      <EvidenceTile
        title="Refund QR / UPI"
        evidence={detail.refundQrEvidence}
        emptyLabel="Refund QR not uploaded yet"
      />
    </div>
  );
}
