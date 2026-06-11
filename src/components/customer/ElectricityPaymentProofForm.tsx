'use client';

import { useState } from 'react';

export function ElectricityPaymentProofForm({
  invoiceId,
  amountLabel,
  uploadScreenshot,
  existingProofUrl,
}: {
  invoiceId: string;
  amountLabel: string;
  uploadScreenshot: (formData: FormData) => Promise<string>;
  existingProofUrl?: string | null;
}) {
  const [screenshotUrl, setScreenshotUrl] = useState(existingProofUrl ?? '');
  const [transactionRef, setTransactionRef] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(Boolean(existingProofUrl));

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
      setError('Upload a payment screenshot.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/electricity-invoice/${invoiceId}/payment-proof`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentProofUrl: screenshotUrl,
          transactionRef: transactionRef || undefined,
        }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? 'Submission failed.');
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
        Payment proof submitted. An admin will verify and mark this invoice paid.
        {screenshotUrl ? (
          <a
            href={screenshotUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block font-medium text-emerald-700 hover:underline"
          >
            View uploaded screenshot
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <h3 className="text-sm font-semibold text-zinc-900">Pay via QR + upload proof</h3>
      <p className="text-sm text-zinc-600">
        Amount: <span className="font-semibold">{amountLabel}</span>. Scan your PG QR on{' '}
        <span className="font-medium">/pgs</span>, pay via UPI, then upload the screenshot below.
      </p>
      <label className="block text-sm">
        <span className="text-zinc-500">Payment screenshot</span>
        <input
          type="file"
          accept="image/*"
          className="mt-1 block w-full text-sm"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        {uploading ? <span className="text-xs text-zinc-500">Uploading…</span> : null}
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
        disabled={pending || uploading}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {pending ? 'Submitting…' : 'Submit payment proof'}
      </button>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </form>
  );
}
