'use client';

import Image from 'next/image';
import { useState } from 'react';
import { resolveBlobImageDisplaySrc } from '@/src/lib/storage/blobImageDisplay';
import { paiseToInr } from '@/src/lib/format';
import type { CheckoutSettlementImageEvidence } from '@/src/lib/checkout/checkoutSettlementImages';

const BTN =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/[0.08]';

export function CheckoutPaymentPanel({
  refundPaise,
  upiId,
  evidence,
  customerName,
}: {
  refundPaise: number;
  upiId: string | null;
  evidence: CheckoutSettlementImageEvidence;
  customerName: string;
}) {
  const [copied, setCopied] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const displaySrc = evidence.viewUrl
    ? resolveBlobImageDisplaySrc(evidence.storedUrl, evidence.viewUrl)
    : null;
  const showQr = Boolean(displaySrc) && evidence.fetchable && !loadFailed;
  const trimmedUpi = upiId?.trim() ?? '';

  async function copyUpi() {
    if (!trimmedUpi) return;
    await navigator.clipboard.writeText(trimmedUpi);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function downloadQr() {
    if (!displaySrc) return;
    const res = await fetch(displaySrc);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${customerName.replace(/\s+/g, '-').toLowerCase()}-refund-qr.png`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8 rounded-3xl bg-[#1A1F27]/90 p-8 ring-1 ring-white/[0.06]">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-apg-silver">Refund amount</p>
        <p className="mt-2 text-5xl font-semibold tracking-tight text-white">{paiseToInr(refundPaise)}</p>
        <p className="mt-2 text-sm text-apg-silver">
          Scan the QR or copy UPI, send this amount, then confirm below.
        </p>
      </div>

      {showQr && displaySrc ? (
        <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-3xl bg-black/40 ring-1 ring-white/10">
          <Image
            src={displaySrc}
            alt="Refund QR code"
            fill
            className="object-contain p-4"
            unoptimized
            onError={() => setLoadFailed(true)}
          />
        </div>
      ) : (
        <p className="text-center text-sm text-apg-silver">Refund QR not available.</p>
      )}

      {trimmedUpi ? (
        <div className="rounded-2xl bg-black/25 px-6 py-5 text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-apg-silver">UPI ID</p>
          <p className="mt-2 font-mono text-2xl text-white">{trimmedUpi}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-center gap-3">
        {trimmedUpi ? (
          <button type="button" onClick={() => void copyUpi()} className={BTN}>
            {copied ? 'Copied' : 'Copy UPI'}
          </button>
        ) : null}
        {showQr ? (
          <>
            <button type="button" onClick={() => void downloadQr()} className={BTN}>
              Download QR
            </button>
            <button type="button" onClick={() => setFullscreen(true)} className={BTN}>
              Open QR full screen
            </button>
          </>
        ) : null}
      </div>

      {fullscreen && showQr && displaySrc ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-6"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="absolute right-6 top-6 rounded-xl border border-white/20 px-4 py-2 text-sm text-white"
          >
            Close
          </button>
          <div className="relative h-[min(80vh,80vw)] w-[min(80vh,80vw)]">
            <Image
              src={displaySrc}
              alt="Refund QR code full screen"
              fill
              className="object-contain"
              unoptimized
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
