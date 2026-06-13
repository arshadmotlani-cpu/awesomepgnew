'use client';

import Link from 'next/link';
import { useCallback, useId, useRef, useState } from 'react';
import { mirrorClientEventToPostHog } from '@/src/lib/analytics/client';
import { customerPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import { paiseToInr } from '@/src/lib/format';
import { CheckoutDepositAccordion } from './CheckoutDepositAccordion';
import { CheckoutProgressStepper } from './CheckoutProgressStepper';

type SubmitResult = { ok: boolean; message?: string };

export type BookingCheckoutExperienceProps = {
  bookingCode: string;
  pgName: string;
  bedsLabel: string;
  isReserveBooking: boolean;
  durationMode: string;
  expectedCheckoutDate: string | null;
  reserveStart?: string | null;
  reserveCheckIn?: string | null;
  subtotalPaise: number;
  depositPaise: number;
  totalPaise: number;
  totalLabel: string;
  qrImageUrl: string;
  upiId: string | null;
  uploadScreenshot: (formData: FormData) => Promise<string>;
  membershipId?: string;
  membershipAmountPaise?: number;
  membershipLabel?: string | null;
  existingProofRecordId?: string | null;
  discountPaise?: number;
};

const PIPELINE = [
  { step: 1, label: 'Scan QR' },
  { step: 2, label: 'Pay exact amount' },
  { step: 3, label: 'Take screenshot' },
  { step: 4, label: 'Upload proof' },
] as const;

export function BookingCheckoutExperience({
  bookingCode,
  pgName,
  bedsLabel,
  isReserveBooking,
  durationMode,
  expectedCheckoutDate,
  reserveStart,
  reserveCheckIn,
  subtotalPaise,
  depositPaise,
  totalPaise,
  totalLabel,
  qrImageUrl,
  upiId,
  uploadScreenshot,
  membershipId,
  membershipAmountPaise,
  membershipLabel,
  existingProofRecordId,
  discountPaise = 0,
}: BookingCheckoutExperienceProps) {
  const galleryInputId = useId();
  const cameraInputId = useId();
  const filesInputId = useId();

  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [transactionRef, setTransactionRef] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(Boolean(existingProofRecordId));
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasScreenshot = Boolean(screenshotUrl);
  const canSubmit = hasScreenshot && !uploading && !pending;

  const onFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setError('Please upload a photo or screenshot (image file).');
        return;
      }
      setUploading(true);
      setError(null);
      setFileName(file.name);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const url = await uploadScreenshot(fd);
        setScreenshotUrl(url);
      } catch (err) {
        setScreenshotUrl('');
        setFileName(null);
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [uploadScreenshot],
  );

  async function copyUpi() {
    if (!upiId) return;
    try {
      await navigator.clipboard.writeText(upiId);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy UPI ID. Select and copy manually.');
    }
  }

  async function downloadQr() {
    try {
      const res = await fetch(qrImageUrl);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `awesomepg-${bookingCode}-qr.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(qrImageUrl, '_blank', 'noopener,noreferrer');
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!screenshotUrl) {
      setError('Upload a payment screenshot before submitting.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/payment-record/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingCode,
          amountPaise: totalPaise,
          paymentScreenshotUrl: screenshotUrl,
          transactionRef: transactionRef || undefined,
          membershipId,
          membershipAmountPaise,
        }),
      });
      const data = (await res.json()) as SubmitResult;
      if (!res.ok || !data.ok) {
        setError(data.message ?? 'Submission failed.');
        return;
      }
      mirrorClientEventToPostHog('payment_uploaded', { bookingCode });
      setDone(true);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setPending(false);
    }
  }

  if (existingProofRecordId && !screenshotUrl) {
    return (
      <div className="space-y-4">
        <div className="apg-glass rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
          Payment proof received — booking{' '}
          <span className="font-mono font-semibold text-white">{bookingCode}</span> is confirmed
          once admin verifies your UPI payment (usually within a few hours).
        </div>
        <a
          href={customerPaymentProofViewUrl('booking', existingProofRecordId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm font-semibold text-apg-orange hover:underline"
        >
          View uploaded screenshot →
        </a>
        <Link
          href={`/booking/${bookingCode}`}
          className="block text-sm font-medium text-apg-silver hover:text-white"
        >
          View booking status →
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="apg-glass rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
        <p className="font-semibold text-white">Payment submitted for approval</p>
        <p className="mt-2">
          We received your proof for {totalLabel}. An admin will verify your UPI payment and confirm
          booking {bookingCode}.
        </p>
        <Link
          href={`/booking/${bookingCode}`}
          className="mt-4 inline-block text-sm font-semibold text-apg-orange hover:underline"
        >
          View booking status →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="pb-28">
      {/* Section 1 — Booking confirmation */}
      <section className="apg-glass rounded-2xl p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>
            👑
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              {isReserveBooking ? 'Complete your reserve payment' : 'Complete your payment'}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-apg-silver">
              {isReserveBooking
                ? 'Your bed is temporarily reserved while we verify payment. The reserve fee is non-refundable.'
                : 'Your bed is temporarily reserved while we verify payment. Scan, pay the exact total, then upload your screenshot.'}
            </p>
          </div>
        </div>
        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-xl apg-glass-light px-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-apg-muted">
              Booking ID
            </dt>
            <dd className="mt-1 font-mono font-semibold text-white">{bookingCode}</dd>
          </div>
          <div className="rounded-xl apg-glass-light px-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-apg-muted">PG</dt>
            <dd className="mt-1 font-semibold text-white">{pgName}</dd>
          </div>
          <div className="rounded-xl apg-glass-light px-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-apg-muted">Bed</dt>
            <dd className="mt-1 font-semibold text-white">{bedsLabel}</dd>
          </div>
        </dl>
        {!isReserveBooking ? (
          <p className="mt-4 text-xs text-apg-muted">
            {titleCaseDuration(durationMode)} · Check-out{' '}
            {expectedCheckoutDate ?? 'Open-ended'}
          </p>
        ) : (
          <p className="mt-4 text-xs text-apg-muted">
            Reserve from {reserveStart ?? '—'} · Check-in {reserveCheckIn ?? '—'}
          </p>
        )}
      </section>

      {/* Section 2 & 3 — Hero pay area */}
      <section className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="apg-glass rounded-2xl p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-apg-muted">
            Total due
          </p>
          <p className="mt-2 text-5xl font-bold tracking-tight text-apg-orange sm:text-6xl">
            {totalLabel}
          </p>
          <p className="mt-6 text-sm font-semibold text-white">Includes</p>
          <ul className="mt-3 space-y-2 text-sm text-apg-silver">
            <li className="flex justify-between gap-4">
              <span>
                {isReserveBooking ? 'Reserve fee (50% rent)' : 'Rent'}
              </span>
              <span className="font-medium text-white">{paiseToInr(subtotalPaise)}</span>
            </li>
            {!isReserveBooking ? (
              <>
                {discountPaise > 0 ? (
                  <li className="flex justify-between gap-4 text-emerald-300">
                    <span>Rent discount (10%)</span>
                    <span className="font-medium">−{paiseToInr(discountPaise)}</span>
                  </li>
                ) : null}
                <li className="flex justify-between gap-4">
                  <span>Refundable deposit</span>
                  <span className="font-medium text-white">{paiseToInr(depositPaise)}</span>
                </li>
              </>
            ) : (
              <li className="flex justify-between gap-4">
                <span>Deposit now</span>
                <span className="font-medium text-white">₹0 — at check-in</span>
              </li>
            )}
            {membershipLabel && membershipAmountPaise ? (
              <li className="flex justify-between gap-4">
                <span>{membershipLabel} PS4 add-on</span>
                <span className="font-medium text-white">{paiseToInr(membershipAmountPaise)}</span>
              </li>
            ) : null}
          </ul>
        </div>

        <div className="apg-glass flex flex-col items-center rounded-2xl p-6 sm:p-8">
          <p className="text-sm font-bold uppercase tracking-widest text-white">Scan &amp; pay</p>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white p-4 shadow-[0_0_40px_rgba(255,90,31,0.12)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrImageUrl}
              alt="UPI QR code — scan to pay"
              className="mx-auto h-auto w-full max-w-[280px] object-contain sm:max-w-[320px]"
            />
          </div>
          <button
            type="button"
            onClick={() => void downloadQr()}
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-apg-orange hover:underline"
          >
            <span aria-hidden>📥</span> Download QR code
          </button>
          {upiId ? (
            <div className="mt-4 flex w-full max-w-sm flex-wrap items-center justify-center gap-2 rounded-xl apg-glass-light px-4 py-3">
              <code className="truncate text-sm font-semibold text-white">{upiId}</code>
              <button
                type="button"
                onClick={() => void copyUpi()}
                className={
                  'shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ' +
                  (copied
                    ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                    : 'bg-apg-orange text-white apg-glow-btn hover:brightness-110')
                }
              >
                {copied ? '✓ UPI ID copied' : '📋 Copy'}
              </button>
            </div>
          ) : null}
          <p className="mt-3 text-center text-[11px] text-apg-muted">
            Pay the exact amount shown · Open GPay / PhonePe after downloading QR
          </p>
        </div>
      </section>

      {/* Section 4 — Pipeline */}
      <section className="mt-8 apg-glass rounded-2xl px-4 py-5 sm:px-6">
        <ol className="flex flex-wrap items-center justify-center gap-2 text-xs font-semibold sm:gap-0 sm:text-sm">
          {PIPELINE.map((item, i) => (
            <li key={item.step} className="flex items-center">
              <span className="rounded-full bg-apg-orange/15 px-3 py-1.5 text-apg-orange ring-1 ring-apg-orange/30">
                {item.step}.{' '}
                {item.step === 2 ? `Pay ${totalLabel}` : item.label}
              </span>
              {i < PIPELINE.length - 1 ? (
                <span className="mx-2 hidden text-apg-muted sm:inline" aria-hidden>
                  ───➔
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {/* Section 5 & 6 — Upload */}
      <section className="mt-8 space-y-4">
        <div
          className={
            'apg-glass rounded-2xl border-2 border-dashed p-8 text-center transition ' +
            (dragOver
              ? 'border-apg-orange/60 bg-apg-orange/5'
              : hasScreenshot
                ? 'border-emerald-500/40 bg-emerald-500/5'
                : 'border-white/15 hover:border-apg-orange/40')
          }
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            void onFile(file ?? null);
          }}
        >
          {uploading ? (
            <p className="text-sm font-medium text-apg-silver">Uploading…</p>
          ) : hasScreenshot ? (
            <>
              <p className="text-lg font-bold text-emerald-300">Screenshot ready</p>
              {fileName ? (
                <p className="mt-1 truncate text-xs text-apg-muted">{fileName}</p>
              ) : null}
              {screenshotUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={screenshotUrl}
                  alt="Payment screenshot preview"
                  className="mx-auto mt-4 max-h-44 rounded-lg border border-white/10 object-contain"
                />
              ) : null}
            </>
          ) : (
            <>
              <p className="text-base font-bold text-white">Drag &amp; drop payment screenshot here</p>
              <p className="mt-1 text-sm text-apg-muted">or use one of the options below</p>
            </>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <input
              id={cameraInputId}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
            <input
              id={galleryInputId}
              type="file"
              accept="image/*,.heic,.heif"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
            <input
              id={filesInputId}
              type="file"
              accept="image/*,.heic,.heif"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
            <label
              htmlFor={cameraInputId}
              className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-apg-orange/50 hover:bg-apg-orange/10"
            >
              📸 Camera
            </label>
            <label
              htmlFor={galleryInputId}
              className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-apg-orange/50 hover:bg-apg-orange/10"
            >
              🖼️ Gallery
            </label>
            <label
              htmlFor={filesInputId}
              className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-apg-orange/50 hover:bg-apg-orange/10"
            >
              📄 Files
            </label>
          </div>
        </div>

        <label className="block apg-glass rounded-2xl px-5 py-4">
          <span className="text-sm font-medium text-apg-silver">
            UPI reference number{' '}
            <span className="text-apg-muted">(optional — helps faster approval)</span>
          </span>
          <input
            type="text"
            value={transactionRef}
            onChange={(e) => setTransactionRef(e.target.value)}
            placeholder="e.g. 123456789012"
            className="apg-input-dark mt-2 w-full rounded-xl px-4 py-3 text-sm text-white"
          />
        </label>
      </section>

      {/* Section 8 — Deposit accordion */}
      {!isReserveBooking && depositPaise > 0 ? (
        <div className="mt-8">
          <CheckoutDepositAccordion depositPaise={depositPaise} />
        </div>
      ) : isReserveBooking ? (
        <section className="mt-8 apg-glass rounded-2xl px-5 py-4 text-sm text-rose-200/90">
          Reserve fee is non-refundable and not credited toward future rent or deposit.
        </section>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {/* Section 7 — Sticky submit */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-apg-charcoal/95 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
        <div className="mx-auto max-w-3xl">
          <button
            type="submit"
            disabled={!canSubmit}
            className={
              'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-4 text-base font-bold transition ' +
              (canSubmit
                ? 'bg-apg-orange text-white apg-glow-btn hover:brightness-110'
                : 'cursor-not-allowed bg-white/10 text-apg-muted opacity-50')
            }
          >
            <span aria-hidden>🔒</span>
            {pending
              ? 'Submitting…'
              : hasScreenshot
                ? 'Submit payment for approval'
                : 'Submit payment for approval (upload screenshot first)'}
          </button>
        </div>
      </div>
    </form>
  );
}

function titleCaseDuration(mode: string): string {
  return mode.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
