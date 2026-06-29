'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  submitDepositRefundRequestAction,
  uploadDepositRefundQrAction,
  uploadDepositRefundMeterAction,
  type RequestActionState,
} from '@/app/(customer)/account/resident/request-actions';
import { ImageFileInputInline } from '@/src/components/shared/ImageFileInput';
import { logResidentClientError } from '@/src/lib/client/residentClientLogger';
import { coerceNonNegativePaise, paiseToInr } from '@/src/lib/format';

const idle: RequestActionState = { ok: false };

export function DepositRefundRequestForm({
  bookingId,
  customerId,
  refundableBalancePaise,
  estimatedDeductionPaise = 0,
  onSubmitted,
}: {
  bookingId: string;
  customerId?: string;
  refundableBalancePaise: number;
  estimatedDeductionPaise?: number;
  onSubmitted?: () => void;
}) {
  const [state, formAction, pending] = useActionState(submitDepositRefundRequestAction, idle);
  const [meterUrl, setMeterUrl] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [payoutUpiId, setPayoutUpiId] = useState('');
  const [uploadingMeter, setUploadingMeter] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [useAverage, setUseAverage] = useState(false);
  const depositHeld = coerceNonNegativePaise(refundableBalancePaise);
  const noticeDeduction = coerceNonNegativePaise(estimatedDeductionPaise);
  const hasPayoutDetails = Boolean(qrUrl.trim() || payoutUpiId.trim());
  const canSubmit = Boolean((meterUrl || useAverage) && hasPayoutDetails && depositHeld > 0);

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
      fd.set('bookingId', bookingId);
      const url = await uploadDepositRefundMeterAction(fd);
      setMeterUrl(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.';
      setUploadError(message);
      logResidentClientError('meter photo upload failed', err, {
        page: 'refund_request_form',
        bookingId,
        customerId,
      });
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
      fd.set('bookingId', bookingId);
      const url = await uploadDepositRefundQrAction(fd);
      setQrUrl(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.';
      setUploadError(message);
      logResidentClientError('refund qr upload failed', err, {
        page: 'refund_request_form',
        bookingId,
        customerId,
      });
    } finally {
      setUploadingQr(false);
    }
  }

  return (
    <form action={formAction} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="meterReadingPhotoUrl" value={meterUrl} />
      <input type="hidden" name="payoutQrUrl" value={qrUrl} />
      <input type="hidden" name="payoutUpiId" value={payoutUpiId.trim()} />

      <h4 className="text-sm font-semibold text-zinc-900">Request deposit refund</h4>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-zinc-500">Deposit paid</dt>
          <dd className="font-semibold text-zinc-900">{paiseToInr(depositHeld)}</dd>
        </div>
        {noticeDeduction > 0 ? (
          <>
            <div>
              <dt className="text-xs text-zinc-500">Notice penalty (est.)</dt>
              <dd className="font-semibold text-rose-700">{paiseToInr(noticeDeduction)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-zinc-500">Est. refundable after deductions</dt>
              <dd className="font-semibold text-emerald-800">
                {paiseToInr(Math.max(0, depositHeld - noticeDeduction))}
              </dd>
            </div>
          </>
        ) : null}
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-zinc-600">
        Final electricity charges will be calculated after meter verification and deducted from
        your refundable deposit balance. Use average billing only if meter photo is unavailable.
      </p>

      <label className="mt-3 flex items-center gap-2 text-xs text-zinc-700">
        <input
          type="checkbox"
          name="useAverageBillingFallback"
          value="1"
          checked={useAverage}
          onChange={(e) => setUseAverage(e.target.checked)}
        />
        Use property average electricity bill (no meter photo)
      </label>

      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="text-xs font-semibold text-zinc-800">
            Electricity meter photo {!useAverage ? <span className="text-rose-600">*</span> : null}
          </span>
          <ImageFileInputInline
            disabled={uploadingMeter}
            onFileSelected={(file) => void handleMeterFile(file ?? null)}
            className="mt-1 block w-full text-xs text-zinc-600"
          />
          {meterUrl ? <p className="mt-1 text-xs text-emerald-700">Meter photo uploaded.</p> : null}
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-zinc-800">
            QR code for refund payment <span className="text-zinc-500">(or UPI ID below)</span>
          </span>
          <ImageFileInputInline
            disabled={uploadingQr}
            onFileSelected={(file) => void handleQrFile(file ?? null)}
            className="mt-1 block w-full text-xs text-zinc-600"
          />
          {qrUrl ? <p className="mt-1 text-xs text-emerald-700">QR code uploaded.</p> : null}
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-zinc-800">UPI ID for refund</span>
          <input
            type="text"
            inputMode="email"
            autoComplete="off"
            value={payoutUpiId}
            onChange={(e) => setPayoutUpiId(e.target.value)}
            placeholder="name@upi"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
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
