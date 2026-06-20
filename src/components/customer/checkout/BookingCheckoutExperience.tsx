'use client';

import Link from 'next/link';
import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { mirrorClientEventToPostHog } from '@/src/lib/analytics/client';
import { customerPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import { paiseToInr } from '@/src/lib/format';
import {
  formatStayDateTime,
  STAY_CHECK_OUT_TIME,
} from '@/src/lib/residents/stayBillingRules';

type SubmitResult = { ok: boolean; message?: string };

export type BookingCheckoutExperienceProps = {
  bookingCode: string;
  pgName: string;
  roomNumber?: string;
  bedCode?: string;
  /** @deprecated Prefer roomNumber + bedCode */
  bedsLabel?: string;
  isReserveBooking: boolean;
  durationMode: string;
  expectedCheckoutDate: string | null;
  checkInDate?: string | null;
  stayNights?: number | null;
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
  /** Kept for API compat — not shown in the customer breakdown. */
  discountPaise?: number;
  depositCreditAppliedPaise?: number;
  additionalDepositDuePaise?: number;
};

const STEPS = [
  { n: 1, label: 'Scan QR' },
  { n: 2, label: 'Pay exact amount' },
  { n: 3, label: 'Upload screenshot' },
  { n: 4, label: 'Submit' },
] as const;

function stayTypeLabel(mode: string, isReserve: boolean): string {
  if (isReserve) return 'Reserve hold';
  if (mode === 'open_ended') return 'Continue living';
  if (mode === 'fixed_stay') return 'Fixed stay';
  return mode.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function rentLineLabel(
  isReserve: boolean,
  nights: number | null | undefined,
  mode: string,
): string {
  if (isReserve) return 'Reserve fee (50% rent)';
  if (nights != null && nights > 0) {
    return `Rent (${nights} day${nights === 1 ? '' : 's'})`;
  }
  if (mode === 'open_ended') return 'Monthly rent';
  return 'Rent';
}

export function BookingCheckoutExperience({
  bookingCode,
  pgName,
  roomNumber,
  bedCode,
  bedsLabel,
  isReserveBooking,
  durationMode,
  expectedCheckoutDate,
  checkInDate,
  stayNights,
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
  const uploadInputId = useId();

  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [transactionRef, setTransactionRef] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(Boolean(existingProofRecordId));
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rentPaise = Math.max(0, subtotalPaise - discountPaise);
  const depositLinePaise = isReserveBooking ? 0 : depositPaise;
  const payNowPaise = totalPaise;
  const payNowLabel = paiseToInr(payNowPaise);
  const hasScreenshot = Boolean(screenshotUrl);
  const canSubmit = hasScreenshot && !uploading && !pending;

  const bedDisplay =
    roomNumber && bedCode
      ? `${bedCode} · Room ${roomNumber}`
      : bedsLabel ?? '—';

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
          amountPaise: payNowPaise,
          paymentScreenshotUrl: screenshotUrl,
          transactionRef: transactionRef || undefined,
          membershipId,
          membershipAmountPaise,
          partialDepositRequested: false,
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
        <div className="rounded-[16px] border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
          Payment proof received — booking{' '}
          <span className="font-mono font-semibold text-white">{bookingCode}</span> is confirmed once
          admin verifies your UPI payment (usually within a few hours).
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
      <div className="rounded-[16px] border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
        <p className="font-semibold text-white">Payment submitted</p>
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
    <form onSubmit={onSubmit} className="space-y-5 pb-28">
      {/* Total payment summary */}
      <section className="rounded-[16px] border border-white/10 bg-white/[0.03] p-5 shadow-sm">
        <h1 className="text-[22px] font-bold text-white">
          {isReserveBooking ? 'Complete reserve payment' : 'Complete payment'}
        </h1>
        <p className="mt-1 text-xs text-apg-muted">
          Pay the exact total below, then upload your UPI screenshot.
        </p>

        <dl className="mt-5 space-y-2.5 text-sm">
          <Row label="Booking ID" value={bookingCode} mono />
          <Row label="PG" value={pgName} />
          <Row label="Room" value={roomNumber ?? '—'} />
          <Row label="Bed" value={bedCode ?? bedDisplay} />
          <Row label="Stay type" value={stayTypeLabel(durationMode, isReserveBooking)} />
          {checkInDate && !isReserveBooking ? (
            <Row label="Check-in" value={formatStayDateTime(checkInDate, 'check-in')} />
          ) : null}
          {!isReserveBooking && expectedCheckoutDate ? (
            <Row
              label="Check-out"
              value={formatStayDateTime(expectedCheckoutDate, 'check-out')}
            />
          ) : null}
          {isReserveBooking ? (
            <>
              <Row label="Reserve from" value={reserveStart ?? '—'} />
              <Row label="Check-in" value={reserveCheckIn ?? '—'} />
            </>
          ) : null}
        </dl>
      </section>

      {/* Breakdown */}
      <section className="rounded-[16px] border border-white/10 bg-white/[0.03] p-5 shadow-sm">
        <h2 className="text-[15px] font-semibold text-white">Breakdown</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-apg-silver">{rentLineLabel(isReserveBooking, stayNights, durationMode)}</dt>
            <dd className="font-semibold text-white">{paiseToInr(rentPaise)}</dd>
          </div>
          {!isReserveBooking && depositLinePaise > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-apg-silver">Refundable deposit</dt>
              <dd className="font-semibold text-white">{paiseToInr(depositLinePaise)}</dd>
            </div>
          ) : null}
          {membershipLabel && membershipAmountPaise ? (
            <div className="flex justify-between gap-4">
              <dt className="text-apg-silver">{membershipLabel}</dt>
              <dd className="font-semibold text-white">{paiseToInr(membershipAmountPaise)}</dd>
            </div>
          ) : null}
        </dl>
        {!isReserveBooking && depositLinePaise > 0 ? (
          <p className="mt-3 text-xs text-apg-muted">Refundable deposit included · not part of rent</p>
        ) : null}

        <div className="mt-5 rounded-[14px] bg-apg-orange/10 px-4 py-4 ring-1 ring-apg-orange/25">
          <p className="text-xs font-medium uppercase tracking-wide text-apg-orange">Total to pay today</p>
          <p className="mt-1 text-3xl font-bold text-white">{payNowLabel}</p>
        </div>
      </section>

      {/* Rules */}
      <div className="grid gap-3 sm:grid-cols-2">
        <InfoBox emoji="💡" title="Deposit info">
          <ul className="list-inside list-disc space-y-1">
            <li>Deposit is fully refundable after checkout</li>
            <li>It is not part of rent</li>
            <li>Held for safety and damage protection</li>
          </ul>
        </InfoBox>
        <InfoBox emoji="⚡" title="Electricity">
          <ul className="list-inside list-disc space-y-1">
            <li>Electricity is included in rent</li>
            <li>AC usage may be charged separately if applicable</li>
            <li>No hidden charges</li>
          </ul>
        </InfoBox>
      </div>

      <InfoBox emoji="⏰" title="Checkout rule">
        <ul className="list-inside list-disc space-y-1">
          <li>Checkout time: {STAY_CHECK_OUT_TIME}</li>
          <li>If the bed is not vacated after {STAY_CHECK_OUT_TIME}, an extra full-day charge applies</li>
        </ul>
      </InfoBox>

      {/* QR */}
      <section className="rounded-[16px] border border-white/10 bg-white/[0.03] p-5 text-center shadow-sm">
        <p className="text-sm font-semibold text-white">Scan &amp; pay {payNowLabel}</p>
        <div className="mx-auto mt-4 max-w-[280px] rounded-[14px] border border-white/10 bg-white p-3 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrImageUrl} alt="UPI QR code" className="mx-auto w-full object-contain" />
        </div>
        <button
          type="button"
          onClick={() => void downloadQr()}
          className="mt-3 text-sm font-semibold text-apg-orange hover:underline"
        >
          Download QR
        </button>
        {upiId ? (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <code className="text-sm font-semibold text-white">{upiId}</code>
            <button
              type="button"
              onClick={() => void copyUpi()}
              className="rounded-lg bg-apg-orange px-3 py-1.5 text-xs font-bold text-white"
            >
              {copied ? 'Copied' : 'Copy UPI'}
            </button>
          </div>
        ) : null}
      </section>

      {/* Steps */}
      <ol className="flex flex-wrap justify-center gap-2 text-[11px] font-semibold text-apg-silver">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className="rounded-full bg-white/[0.06] px-3 py-1.5 ring-1 ring-white/10"
          >
            {s.n}. {s.n === 2 ? `Pay ${payNowLabel}` : s.label}
          </li>
        ))}
      </ol>

      {/* Single upload */}
      <section className="rounded-[16px] border border-white/10 bg-white/[0.03] p-5 shadow-sm">
        <p className="text-sm font-semibold text-white">Upload payment screenshot</p>
        <input
          id={uploadInputId}
          type="file"
          accept="image/*,.heic,.heif"
          capture="environment"
          className="sr-only"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
        <label
          htmlFor={uploadInputId}
          className={
            'mt-3 flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed px-4 py-6 text-center transition ' +
            (hasScreenshot
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : 'border-white/15 hover:border-apg-orange/40 hover:bg-apg-orange/5')
          }
        >
          {uploading ? (
            <span className="text-sm text-apg-silver">Uploading…</span>
          ) : hasScreenshot ? (
            <>
              <span className="text-sm font-semibold text-emerald-300">Screenshot ready</span>
              {fileName ? <span className="max-w-full truncate text-xs text-apg-muted">{fileName}</span> : null}
              <span className="text-xs text-apg-muted">Tap to replace</span>
            </>
          ) : (
            <>
              <span className="text-2xl" aria-hidden>
                📷
              </span>
              <span className="text-sm font-semibold text-white">Tap to upload screenshot</span>
              <span className="text-xs text-apg-muted">Photo from gallery or camera</span>
            </>
          )}
        </label>
        {screenshotUrl && !uploading ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={screenshotUrl}
            alt="Payment screenshot preview"
            className="mx-auto mt-3 max-h-40 rounded-lg border border-white/10 object-contain"
          />
        ) : null}

        <label className="mt-4 block">
          <span className="text-xs text-apg-muted">UPI reference (optional)</span>
          <input
            type="text"
            value={transactionRef}
            onChange={(e) => setTransactionRef(e.target.value)}
            placeholder="e.g. 123456789012"
            className="apg-input-dark mt-1.5 w-full rounded-[12px] px-3 py-2.5 text-sm text-white"
          />
        </label>
      </section>

      {isReserveBooking ? (
        <p className="rounded-[14px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">
          Reserve fee is non-refundable and is separate from rent and deposit.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-[14px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0a0f18]/95 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
        <div className="mx-auto max-w-lg">
          <button
            type="submit"
            disabled={!canSubmit}
            className={
              'flex w-full min-h-[48px] items-center justify-center rounded-[14px] text-base font-bold transition ' +
              (canSubmit
                ? 'bg-apg-orange text-white hover:brightness-105'
                : 'cursor-not-allowed bg-white/10 text-apg-muted')
            }
          >
            {pending ? 'Submitting…' : hasScreenshot ? 'Submit payment' : 'Upload screenshot to continue'}
          </button>
        </div>
      </div>
    </form>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-apg-muted">{label}</dt>
      <dd className={`text-right font-medium text-white ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

function InfoBox({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-apg-silver">
      <p className="font-semibold text-white">
        <span aria-hidden>{emoji} </span>
        {title}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}
