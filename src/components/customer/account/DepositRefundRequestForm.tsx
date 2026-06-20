'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  submitDepositRefundRequestAction,
  uploadDepositRefundQrAction,
  uploadDepositRefundMeterAction,
  type RequestActionState,
} from '@/app/(customer)/account/resident/request-actions';
import { paiseToInr } from '@/src/lib/format';

const idle: RequestActionState = { ok: false };

export function DepositRefundRequestForm({
  bookingId,
  refundableBalancePaise,
  estimatedDeductionPaise = 0,
  onSubmitted,
}: {
  bookingId: string;
  refundableBalancePaise: number;
  estimatedDeductionPaise?: number;
  onSubmitted?: () => void;
}) {
  const [state, formAction, pending] = useActionState(submitDepositRefundRequestAction, idle);
  const [meterUrl, setMeterUrl] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [uploadingMeter, setUploadingMeter] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const canSubmit = Boolean(meterUrl && qrUrl && refundableBalancePaise > 0);

  useEffect(() => {
    if (state.ok) onSubmitted?.();
  }, [state.ok, onSubmitted]);

  async function handleMeterFile(file: File | null) {
    if (!file) return;
    setUploadError(null);
    setUploadingMeter(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const url = await uploadDepositRefundMeterAction(fd);
      setMeterUrl(url);
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
      <input type="hidden" name="useAverageBillingFallback" value="0" />

      <h4 className="text-sm font-semibold text-zinc-900">Request deposit refund</h4>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-zinc-500">Deposit held</dt>
          <dd className="font-semibold text-zinc-900">{paiseToInr(refundableBalancePaise)}</dd>
        </div>
        {estimatedDeductionPaise > 0 ? (
          <div>
            <dt className="text-xs text-zinc-500">Estimated deductions</dt>
            <dd className="font-semibold text-rose-700">{paiseToInr(estimatedDeductionPaise)}</dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-zinc-600">
        Final electricity charges will be calculated after meter verification and deducted from
        your refundable deposit balance.
      </p>

      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="text-xs font-semibold text-zinc-800">
            Electricity meter photo <span className="text-rose-600">*</span>
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={uploadingMeter}
            onChange={(e) => void handleMeterFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-xs text-zinc-600"
          />
          {meterUrl ? <p className="mt-1 text-xs text-emerald-700">Meter photo uploaded.</p> : null}
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-zinc-800">
            QR code for refund payment <span className="text-rose-600">*</span>
          </span>
          <input
            type="file"
            accept="image/*"
            disabled={uploadingQr}
            onChange={(e) => void handleQrFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-xs text-zinc-600"
          />
          {qrUrl ? <p className="mt-1 text-xs text-emerald-700">QR code uploaded.</p> : null}
        </label>
      </div>

      {uploadError ? <p className="mt-2 text-xs text-rose-600">{uploadError}</p> : null}
      {state.error ? <p className="mt-2 text-xs text-rose-600">{state.error}</p> : null}
      {state.ok ? (
        <p className="mt-2 text-xs text-emerald-700">Refund review pending — admin will verify and process.</p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !canSubmit || uploadingMeter || uploadingQr}
        className="mt-4 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? 'Submitting…' : 'Submit refund request'}
      </button>
    </form>
  );
}
