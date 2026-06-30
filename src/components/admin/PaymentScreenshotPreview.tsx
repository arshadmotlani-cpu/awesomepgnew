'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { isDataProofUrl } from '@/src/lib/payments/proofResponse';
import {
  privateBlobRequiresProxy,
  resolveBlobImageDisplaySrc,
  resolveBlobLinkHref,
} from '@/src/lib/storage/blobImageDisplay';

type PaymentScreenshotPreviewProps = {
  url: string;
  /** Authenticated server route that streams private Blob / data-URL proofs. */
  viewHref?: string;
  alt?: string;
  className?: string;
  /** Larger preview for payment review workspace. */
  variant?: 'compact' | 'review';
};

export function PaymentScreenshotPreview({
  url,
  viewHref,
  alt = 'Payment screenshot',
  className,
  variant = 'compact',
}: PaymentScreenshotPreviewProps) {
  const displaySrc = resolveBlobImageDisplaySrc(url, viewHref);
  const fullSizeHref = resolveBlobLinkHref(url, viewHref);
  const downloadHref = fullSizeHref
    ? `${fullSizeHref}${fullSizeHref.includes('?') ? '&' : '?'}download=1`
    : undefined;

  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoom, setZoom] = useState(1);

  const thumbnailClass =
    className ??
    (variant === 'review'
      ? 'max-h-[min(70vh,520px)] w-full cursor-zoom-in rounded-xl border border-white/10 bg-black/50 object-contain'
      : 'h-40 w-full max-w-xs cursor-zoom-in rounded-lg border border-zinc-700 object-contain bg-black/40');

  const resetLightbox = useCallback(() => {
    setLightboxOpen(false);
    setZoom(1);
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resetLightbox();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [lightboxOpen, resetLightbox]);

  async function handleDownload() {
    if (!downloadHref) return;
    try {
      const res = await fetch(downloadHref, { credentials: 'include' });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = 'payment-proof.jpg';
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setLoadError(true);
    }
  }

  if (!displaySrc) {
    return (
      <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-6 text-center">
        <p className="text-sm font-medium text-rose-100">Screenshot unavailable</p>
        <p className="mt-1 text-xs text-rose-200/80">
          {privateBlobRequiresProxy(url) && !viewHref
            ? 'This proof requires an authenticated view URL.'
            : 'No image URL was stored for this payment proof.'}
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-6 text-center">
        <p className="text-sm font-medium text-rose-100">Could not load screenshot</p>
        <p className="mt-1 text-xs text-rose-200/80">
          The file may have been removed or the link expired. Ask the resident to upload again.
        </p>
        {fullSizeHref ? (
          <button
            type="button"
            onClick={() => {
              setLoadError(false);
              setLoaded(false);
            }}
            className="mt-3 text-xs font-medium text-[#FF5A1F] hover:underline"
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  const preview = (
    <button
      type="button"
      onClick={() => setLightboxOpen(true)}
      className="block w-full text-left"
      aria-label="Enlarge payment screenshot"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={displaySrc}
        alt={alt}
        className={thumbnailClass}
        onLoad={() => setLoaded(true)}
        onError={() => setLoadError(true)}
      />
      {!loaded ? (
        <p className="mt-2 text-center text-xs text-apg-silver">Loading preview…</p>
      ) : (
        <p className="mt-2 text-center text-xs text-apg-silver">Click to enlarge</p>
      )}
    </button>
  );

  const lightbox =
    lightboxOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[500] flex flex-col bg-black/90"
            role="dialog"
            aria-modal="true"
            aria-label="Payment screenshot preview"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <p className="truncate text-sm font-medium text-white">{alt}</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/10"
                >
                  −
                </button>
                <span className="min-w-[3rem] text-center text-xs tabular-nums text-apg-silver">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/10"
                >
                  +
                </button>
                {downloadHref ? (
                  <button
                    type="button"
                    onClick={() => void handleDownload()}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/10"
                  >
                    Download
                  </button>
                ) : null}
                {fullSizeHref && !isDataProofUrl(url) ? (
                  <a
                    href={fullSizeHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/10"
                  >
                    Open original
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={resetLightbox}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
                >
                  Close
                </button>
              </div>
            </div>
            <div
              className="flex flex-1 items-center justify-center overflow-auto p-4"
              onClick={resetLightbox}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displaySrc}
                alt={alt}
                className="max-w-none transition-transform duration-150"
                style={{ transform: `scale(${zoom})` }}
                onClick={(e) => e.stopPropagation()}
                onError={() => setLoadError(true)}
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={variant === 'review' ? 'w-full' : 'inline-block max-w-xs'}>
      {preview}
      {lightbox}
    </div>
  );
}
