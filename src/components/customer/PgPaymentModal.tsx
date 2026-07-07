'use client';

import { useId, useState } from 'react';
import { ImageFileInput } from '@/src/components/shared/ImageFileInput';
import { logPaymentClientException } from '@/src/lib/client/paymentClientLogger';

type Category = {
  id: string;
  name: string;
  qrCodeImageUrl: string;
  upiId: string | null;
};

type Props = {
  pgId: string;
  pgName: string;
  category: Category;
  onClose: () => void;
  onSubmitted: () => void;
  uploadScreenshot: (formData: FormData) => Promise<string>;
};

export function PgPaymentModal({
  pgId,
  pgName,
  category,
  onClose,
  onSubmitted,
  uploadScreenshot,
}: Props) {
  const screenshotInputId = useId();
  const isRent = /rent/i.test(category.name);
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      logPaymentClientException('PG payment screenshot upload failed', err, {
        page: 'pg-payment-modal',
        residentId: null,
      });
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const rupees = Number.parseFloat(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setError('Enter a valid amount.');
      setPending(false);
      return;
    }
    if (!screenshotUrl) {
      setError('Upload a payment screenshot.');
      setPending(false);
      return;
    }
    try {
      const res = await fetch('/api/payment-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pgId,
          categoryId: category.id,
          amountPaise: Math.round(rupees * 100),
          month: isRent ? month : undefined,
          paymentScreenshotUrl: screenshotUrl,
          transactionRef: transactionRef || undefined,
        }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? 'Submission failed.');
        return;
      }
      onSubmitted();
      onClose();
    } catch (err) {
      logPaymentClientException('PG payment submit failed', err, {
        page: 'pg-payment-modal',
        residentId: null,
      });
      setError('Network error. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0B0F14] p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-modal-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="payment-modal-title" className="text-lg font-semibold text-white">
              Pay — {category.name}
            </h2>
            <p className="text-xs text-apg-silver">{pgName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-apg-silver hover:bg-white/5"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={category.qrCodeImageUrl}
            alt={`${category.name} QR code`}
            className="mx-auto max-h-56 w-full max-w-xs object-contain"
          />
          {category.upiId ? (
            <div className="mt-2 flex items-center justify-center gap-2 text-sm">
              <span className="text-apg-silver">UPI:</span>
              <code className="rounded bg-white/5 px-2 py-0.5 text-[#FF5A1F]">
                {category.upiId}
              </code>
              <button
                type="button"
                className="text-xs text-apg-silver underline"
                onClick={async () => {
                  try {
                    if (!navigator.clipboard?.writeText) {
                      throw new Error('Clipboard API unavailable');
                    }
                    await navigator.clipboard.writeText(category.upiId ?? '');
                  } catch (err) {
                    logPaymentClientException('PG payment UPI copy failed', err, {
                      page: 'pg-payment-modal',
                      residentId: null,
                    });
                    setError('Could not copy UPI ID. Please copy manually.');
                  }
                }}
              >
                Copy
              </button>
            </div>
          ) : null}
          <p className="mt-2 text-xs text-apg-silver">
            Scan the QR, pay via UPI, then upload your screenshot below.
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-apg-silver">Amount (₹) *</span>
            <input
              type="number"
              min="1"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="apg-field-input mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
            />
          </label>

          {isRent ? (
            <label className="block text-sm">
              <span className="text-apg-silver">Month *</span>
              <input
                type="month"
                required
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="apg-field-input mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
              />
            </label>
          ) : null}

          <label className="block text-sm">
            <span className="text-apg-silver">UPI transaction ref (optional)</span>
            <input
              type="text"
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              className="apg-field-input mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
            />
          </label>

          <div>
            <span className="text-sm text-apg-silver">Payment screenshot *</span>
            <label
              htmlFor={screenshotInputId}
              className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/20 px-3 py-3 text-sm text-apg-silver hover:border-[#FF5A1F]/50"
            >
              <ImageFileInput
                id={screenshotInputId}
                inputClassName="hidden"
                disabled={uploading}
                onFileSelected={(file) => void onFile(file ?? null)}
              />
              {uploading ? 'Uploading…' : screenshotUrl ? 'Screenshot uploaded ✓' : 'Upload screenshot'}
            </label>
          </div>

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}

          <button
            type="submit"
            disabled={pending || uploading}
            className="w-full rounded-lg bg-[#FF5A1F] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? 'Submitting…' : 'Submit payment proof'}
          </button>
        </form>
      </div>
    </div>
  );
}
