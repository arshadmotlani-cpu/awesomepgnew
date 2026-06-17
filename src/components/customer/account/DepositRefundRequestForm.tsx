'use client';

import { useActionState, useState } from 'react';
import {
  submitDepositRefundRequestAction,
  uploadDepositRefundQrAction,
  uploadDepositRefundMeterAction,
  type RequestActionState,
} from '@/app/(customer)/account/resident/request-actions';

const idle: RequestActionState = { ok: false };

export function DepositRefundRequestForm({
  bookingId,
  refundableBalancePaise,
}: {
  bookingId: string;
  refundableBalancePaise: number;
}) {
  const [state, formAction, pending] = useActionState(submitDepositRefundRequestAction, idle);
  const [useAverageBilling, setUseAverageBilling] = useState(false);
  const [meterUrl, setMeterUrl] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [payoutUpiId, setPayoutUpiId] = useState('');
  const [uploadingMeter, setUploadingMeter] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const hasPayout = Boolean(payoutUpiId.trim() || qrUrl);
  const hasMeter = Boolean(useAverageBilling || meterUrl);
  const canSubmit = hasMeter && hasPayout && refundableBalancePaise > 0;

  async function handleMeterFile(file: File | null) {
    if (!file) return;
    setUploadError(null);
    setUploadingMeter(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const url = await uploadDepositRefundMeterAction(fd);
      setMeterUrl(url);
      setUseAverageBilling(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploadingMeter(false);
    }
  }

  async function handleQrFile(file: File | null) {
    if (!file) return;
    setUploadError(null);
    setUploadingQr(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const url = await uploadDepositRefundQrAction(fd);
      setQrUrl(url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploadingQr(false);
    }
  }

  return (
    <form action={formAction} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="meterReadingPhotoUrl" value={meterUrl} />
      <input type="hidden" name="payoutQrUrl" value={qrUrl} />
      <input type="hidden" name="useAverageBillingFallback" value={useAverageBilling ? '1' : '0'} />

      <h4 className="text-sm font-semibold text-zinc-900">Request deposit refund</h4>
      <p className="mt-1 text-xs text-zinc-600">
        Wallet balance: ₹{(refundableBalancePaise / 100).toLocaleString('en-IN')}. Admin calculates
        final electricity and deductions, then transfers to your UPI account.
      </p>

      <div className="mt-4 space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-zinc-800">
            Final electricity meter reading <span className="text-rose-600">*</span>
          </legend>
          <label className="flex items-start gap-2 text-xs text-zinc-700">
            <input
              type="checkbox"
              checked={useAverageBilling}
              onChange={(e) => {
                setUseAverageBilling(e.target.checked);
                if (e.target.checked) setMeterUrl('');
              }}
              className="mt-0.5"
            />
            <span>
              Use average billing fallback (no meter photo available — admin will apply room average)
            </span>
          </label>
          {!useAverageBilling ? (
            <div className="space-y-2">
              <input
                type="file"
                accept="image/*"
                disabled={uploadingMeter}
                onChange={(e) => void handleMeterFile(e.target.files?.[0] ?? null)}
                className="block w-full text-xs text-zinc-600"
              />
              {meterUrl ? (
                <p className="text-xs text-emerald-700">Meter photo uploaded.</p>
              ) : (
                <p className="text-xs text-zinc-500">Upload a clear photo of the final meter reading.</p>
              )}
            </div>
          ) : null}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-zinc-800">
            Payout method <span className="text-rose-600">*</span>
          </legend>
          <label className="block text-xs text-zinc-700">
            UPI ID
            <input
              type="text"
              name="payoutUpiId"
              value={payoutUpiId}
              onChange={(e) => setPayoutUpiId(e.target.value)}
              placeholder="name@upi"
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </label>
          <p className="text-center text-[10px] text-zinc-400">— OR —</p>
          <label className="block text-xs text-zinc-700">
            UPI QR code image
            <input
              type="file"
              accept="image/*"
              disabled={uploadingQr}
              onChange={(e) => void handleQrFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-xs text-zinc-600"
            />
          </label>
          {qrUrl ? <p className="text-xs text-emerald-700">QR code uploaded.</p> : null}
          <p className="text-xs text-zinc-500">Provide at least one payout method.</p>
        </fieldset>

        <label className="block text-xs font-medium text-zinc-700">
          Notes (optional)
          <textarea
            name="notes"
            rows={2}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            placeholder="Any extra context for admin…"
          />
        </label>
      </div>

      {uploadError ? <p className="mt-2 text-xs text-rose-600">{uploadError}</p> : null}
      {state.error ? <p className="mt-2 text-xs text-rose-600">{state.error}</p> : null}
      {state.ok ? (
        <p className="mt-2 text-xs text-emerald-700">
          Refund request submitted — admin will review and process within 24 hours after dues clear.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !canSubmit || uploadingMeter || uploadingQr}
        className="mt-4 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? 'Submitting…' : 'Submit refund request'}
      </button>
      {!canSubmit && refundableBalancePaise > 0 ? (
        <p className="mt-2 text-[10px] text-zinc-500">
          Complete meter evidence and payout method before submitting.
        </p>
      ) : null}
    </form>
  );
}
