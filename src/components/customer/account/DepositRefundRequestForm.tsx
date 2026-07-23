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
import { primaryBtn } from '@/src/lib/design-system/tokens';
import type { DepositRefundSettlementPreview } from '@/src/lib/deposits/depositRefundSettlementPreview';

const idle: RequestActionState = { ok: false };

export function DepositRefundRequestForm({
  bookingId,
  customerId,
  refundableBalancePaise,
  estimatedDeductionPaise = 0,
  settlementPreview = null,
  onSubmitted,
  compact = false,
}: {
  bookingId: string;
  customerId?: string;
  refundableBalancePaise: number;
  estimatedDeductionPaise?: number;
  settlementPreview?: DepositRefundSettlementPreview | null;
  onSubmitted?: () => void;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(submitDepositRefundRequestAction, idle);
  const [meterUrl, setMeterUrl] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [payoutUpiId, setPayoutUpiId] = useState('');
  const [uploadingMeter, setUploadingMeter] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const depositHeld = coerceNonNegativePaise(
    settlementPreview?.depositBalancePaise ?? refundableBalancePaise,
  );
  const noticeDeduction = coerceNonNegativePaise(estimatedDeductionPaise);
  const hasPayoutDetails = Boolean(qrUrl.trim() || payoutUpiId.trim());
  const canSubmit = Boolean(meterUrl.trim() && hasPayoutDetails && depositHeld > 0);

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
    <form
      action={formAction}
      className={compact ? 'rounded-xl border border-zinc-200 bg-white p-5' : 'rounded-lg border border-zinc-200 bg-zinc-50 p-4'}
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="meterReadingPhotoUrl" value={meterUrl} />
      <input type="hidden" name="payoutQrUrl" value={qrUrl} />
      <input type="hidden" name="payoutUpiId" value={payoutUpiId.trim()} />

      <h4 className="text-sm font-semibold text-zinc-900">Request deposit refund</h4>
      <p className="mt-1 text-xs text-zinc-600">
        Upload your final AC meter photo and UPI QR code. Admin will verify and calculate your final
        refund.
      </p>

      {noticeDeduction > 0 && !compact ? (
        <p className="mt-2 text-xs text-zinc-600">
          Estimated notice deduction: {paiseToInr(noticeDeduction)} (final amount confirmed at
          settlement).
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="text-xs font-semibold text-zinc-800">
            Final AC meter photo <span className="text-rose-600">*</span>
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
            UPI QR code for refund <span className="text-rose-600">*</span>
          </span>
          <ImageFileInputInline
            disabled={uploadingQr}
            onFileSelected={(file) => void handleQrFile(file ?? null)}
            className="mt-1 block w-full text-xs text-zinc-600"
          />
          {qrUrl ? <p className="mt-1 text-xs text-emerald-700">QR code uploaded.</p> : null}
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-zinc-800">
            Or enter UPI ID <span className="text-zinc-500">(if no QR)</span>
          </span>
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
        <p className="mt-2 text-xs text-emerald-700">
          Refund request submitted — we will review and confirm your final amount.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !canSubmit || uploadingMeter || uploadingQr}
        className={`${primaryBtn} mt-4 w-full`}
      >
        {pending ? 'Submitting…' : 'Submit refund request'}
      </button>
    </form>
  );
}
