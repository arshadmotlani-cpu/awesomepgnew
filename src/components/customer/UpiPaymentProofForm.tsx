'use client';

import { useState } from 'react';

type SubmitResult = { ok: boolean; message?: string };

export function UpiPaymentProofForm({
  amountLabel,
  heading = 'Pay via QR + upload proof',
  instructions,
  qrImageUrl,
  upiId,
  existingProofUrl,
  uploadScreenshot,
  submitProof,
  doneMessage = 'Payment proof submitted. An admin will verify the screenshot and mark it paid.',
}: {
  amountLabel: string;
  heading?: string;
  instructions?: string;
  qrImageUrl?: string | null;
  upiId?: string | null;
  existingProofUrl?: string | null;
  uploadScreenshot: (formData: FormData) => Promise<string>;
  submitProof: (args: {
    screenshotUrl: string;
    transactionRef?: string;
  }) => Promise<SubmitResult>;
  doneMessage?: string;
}) {
  const [screenshotUrl, setScreenshotUrl] = useState(existingProofUrl ?? '');
  const [transactionRef, setTransactionRef] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(Boolean(existingProofUrl));

  async function onFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload a photo or screenshot (image file).');
      return;
    }
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
      setError('Upload a photo of your payment (screenshot or UPI receipt).');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await submitProof({
        screenshotUrl,
        transactionRef: transactionRef || undefined,
      });
      if (!result.ok) {
        setError(result.message ?? 'Submission failed.');
        return;
      }
      setDone(true);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
        {doneMessage}
        {screenshotUrl ? (
          <a
            href={screenshotUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block font-medium text-emerald-700 hover:underline"
          >
            View uploaded photo
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4"
    >
      <h3 className="text-sm font-semibold text-zinc-900">{heading}</h3>
      <p className="text-sm text-zinc-600">
        Amount: <span className="font-semibold">{amountLabel}</span>.
        {instructions ? ` ${instructions}` : ' Scan the QR, pay via UPI, then upload a photo of the payment.'}
      </p>

      {qrImageUrl ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrImageUrl}
            alt="UPI QR code"
            className="mx-auto max-h-48 w-full max-w-xs object-contain"
          />
          {upiId ? (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm">
              <span className="text-zinc-500">UPI:</span>
              <code className="rounded bg-zinc-100 px-2 py-0.5 text-indigo-700">{upiId}</code>
              <button
                type="button"
                className="text-xs text-zinc-500 underline"
                onClick={() => navigator.clipboard.writeText(upiId)}
              >
                Copy
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Payment photo *</span>
        <input
          type="file"
          accept="image/*"
          required
          className="mt-1 block w-full text-sm"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
        {uploading ? <span className="text-xs text-zinc-500">Uploading…</span> : null}
        {screenshotUrl && !uploading ? (
          <span className="text-xs text-emerald-600">Photo uploaded ✓</span>
        ) : null}
      </label>

      <label className="block text-sm">
        <span className="text-zinc-500">UPI reference (optional)</span>
        <input
          type="text"
          value={transactionRef}
          onChange={(e) => setTransactionRef(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>

      <button
        type="submit"
        disabled={pending || uploading || !screenshotUrl}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {pending ? 'Submitting…' : 'Submit payment photo for approval'}
      </button>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </form>
  );
}
