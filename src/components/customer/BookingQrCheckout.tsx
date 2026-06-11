'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DEFAULT_RENT_DEPOSIT_UPI_ID } from '@/src/lib/payments/defaultQr';

type Props = {
  bookingCode: string;
  pgName: string;
  totalPaise: number;
  totalLabel: string;
  qrImageUrl: string;
  upiId: string | null;
  uploadScreenshot: (formData: FormData) => Promise<string>;
};

export function BookingQrCheckout({
  bookingCode,
  pgName,
  totalPaise,
  totalLabel,
  qrImageUrl,
  upiId,
  uploadScreenshot,
}: Props) {
  const [transactionRef, setTransactionRef] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayUpi = upiId ?? DEFAULT_RENT_DEPOSIT_UPI_ID;

  async function onFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const url = await uploadScreenshot(fd);
      setScreenshotUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!screenshotUrl) {
      setError('Upload your UPI payment screenshot.');
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
        }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? 'Submission failed.');
        return;
      }
      setSubmitted(true);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-semibold">Payment proof submitted</p>
        <p className="mt-2">
          We&apos;ll verify your UPI payment of <strong>{totalLabel}</strong> and confirm booking{' '}
          <span className="font-mono">{bookingCode}</span>. You&apos;ll get access once approved.
        </p>
        <Link
          href={`/booking/${bookingCode}`}
          className="mt-3 inline-block text-sm font-semibold text-emerald-800 underline"
        >
          View booking status →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">
        Pay <span className="font-semibold text-zinc-900">{totalLabel}</span> for{' '}
        <span className="font-medium">{pgName}</span> via UPI, then upload your screenshot.
      </p>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrImageUrl}
          alt="UPI QR for rent, deposit and booking"
          className="mx-auto max-h-56 w-full max-w-xs object-contain"
        />
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-zinc-500">UPI:</span>
          <code className="rounded bg-white px-2 py-0.5 text-[#FF5A1F]">{displayUpi}</code>
          <button
            type="button"
            className="text-xs text-zinc-500 underline"
            onClick={() => navigator.clipboard.writeText(displayUpi)}
          >
            Copy
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Rent, deposit & booking · use the electricity QR for power bills, daily stays & reservations
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block text-sm">
          <span className="text-zinc-600">UPI transaction ref (optional)</span>
          <input
            type="text"
            value={transactionRef}
            onChange={(e) => setTransactionRef(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
          />
        </label>

        <div>
          <span className="text-sm text-zinc-600">Payment screenshot *</span>
          <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-3 py-3 text-sm text-zinc-600 hover:border-[#FF5A1F]/50">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
            {uploading ? 'Uploading…' : screenshotUrl ? 'Screenshot uploaded ✓' : 'Upload screenshot'}
          </label>
        </div>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <button
          type="submit"
          disabled={pending || uploading}
          className="w-full rounded-lg bg-[#FF5A1F] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? 'Submitting…' : `Submit proof · ${totalLabel}`}
        </button>
      </form>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Need help? Use the WhatsApp Support button — it stays visible on every page.
      </p>
    </div>
  );
}
