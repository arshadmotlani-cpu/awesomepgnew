'use client';

import { useId, useState } from 'react';

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
  const inputId = useId();
  const [screenshotUrl, setScreenshotUrl] = useState(existingProofUrl ?? '');
  const [fileName, setFileName] = useState<string | null>(null);
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
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 ring-1 ring-inset ring-emerald-500/20">
        {doneMessage}
        {screenshotUrl ? (
          <a
            href={screenshotUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block font-medium text-[#FF5A1F] hover:underline"
          >
            View uploaded photo →
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="apg-glass space-y-4 rounded-2xl p-5"
    >
      <div>
        <h3 className="text-base font-semibold text-white">{heading}</h3>
        <p className="mt-1 text-sm text-apg-silver">
          Amount: <span className="font-semibold text-white">{amountLabel}</span>.
          {instructions
            ? ` ${instructions}`
            : ' Scan the QR, pay via UPI, then upload a photo of the payment.'}
        </p>
      </div>

      {qrImageUrl ? (
        <div className="rounded-xl border border-white/10 bg-white p-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrImageUrl}
            alt="UPI QR code — scan to pay"
            className="mx-auto max-h-52 w-full max-w-xs object-contain"
          />
          {upiId ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm">
              <span className="text-zinc-600">UPI ID:</span>
              <code className="rounded bg-zinc-100 px-2 py-1 text-sm font-semibold text-zinc-900">
                {upiId}
              </code>
              <button
                type="button"
                className="rounded-md bg-[#FF5A1F] px-2.5 py-1 text-xs font-semibold text-white hover:brightness-110"
                onClick={() => void navigator.clipboard.writeText(upiId)}
              >
                Copy
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm font-medium text-white">
          Step 2 — Upload payment screenshot <span className="text-[#FF5A1F]">*</span>
        </p>

        <input
          id={inputId}
          type="file"
          accept="image/*,.heic,.heif"
          className="sr-only"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />

        <label
          htmlFor={inputId}
          className={
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ' +
            (screenshotUrl
              ? 'border-emerald-500/50 bg-emerald-500/10'
              : 'border-[#FF5A1F]/40 bg-[#FF5A1F]/5 hover:border-[#FF5A1F]/70 hover:bg-[#FF5A1F]/10')
          }
        >
          {uploading ? (
            <span className="text-sm font-medium text-apg-silver">Uploading…</span>
          ) : screenshotUrl ? (
            <>
              <span className="text-2xl" aria-hidden>
                ✓
              </span>
              <span className="text-sm font-semibold text-emerald-300">Screenshot uploaded</span>
              {fileName ? (
                <span className="max-w-full truncate text-xs text-apg-silver">{fileName}</span>
              ) : null}
              <span className="text-xs text-apg-silver">Tap to replace</span>
            </>
          ) : (
            <>
              <span className="text-2xl" aria-hidden>
                📷
              </span>
              <span className="text-sm font-semibold text-white">Choose screenshot from gallery</span>
              <span className="text-xs text-apg-silver">
                Photo library, Files, or saved UPI payment receipt
              </span>
            </>
          )}
        </label>

        {screenshotUrl && !uploading ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={screenshotUrl}
            alt="Payment screenshot preview"
            className="mx-auto max-h-40 rounded-lg border border-white/10 object-contain"
          />
        ) : null}
      </div>

      <label className="block text-sm">
        <span className="font-medium text-apg-silver">UPI reference (optional)</span>
        <input
          type="text"
          value={transactionRef}
          onChange={(e) => setTransactionRef(e.target.value)}
          placeholder="e.g. 123456789012"
          className="apg-input-dark mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm"
        />
      </label>

      <button
        type="submit"
        disabled={pending || uploading || !screenshotUrl}
        className="apg-glow-btn w-full rounded-lg bg-[#FF5A1F] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? 'Submitting…' : 'Submit payment for approval'}
      </button>

      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
    </form>
  );
}
