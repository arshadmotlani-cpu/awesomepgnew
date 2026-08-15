'use client';

import { useActionState, useEffect, useState, type FormEvent } from 'react';
import {
  submitDepositRefundRequestAction,
  uploadDepositRefundQrAction,
  uploadDepositRefundMeterAction,
  type RequestActionState,
} from '@/app/(customer)/account/resident/request-actions';
import { ImageFileInputInline } from '@/src/components/shared/ImageFileInput';
import { logResidentClientError } from '@/src/lib/client/residentClientLogger';
import { coerceNonNegativePaise, paiseToInr } from '@/src/lib/format';
import { PENDING_ELECTRICITY_LABEL } from '@/src/lib/checkout/settlementDisplayFormat';
import { primaryBtn } from '@/src/lib/design-system/tokens';
import type { DepositRefundSettlementPreview } from '@/src/lib/deposits/depositRefundSettlementPreview';
import { getDepositRefundValidationMessage } from '@/src/lib/billing/depositRefundRequirements';
import { ExitBrainRefundBreakdown } from '@/src/components/customer/account/resident/vacating/ExitBrainRefundBreakdown';
import type { ResidentExitBrainSnapshot } from '@/src/lib/exit/exitBrainTypes';

const idle: RequestActionState = { ok: false };

function uploadStatusLabel(uploaded: boolean): { text: string; className: string } {
  return uploaded
    ? { text: '✓ uploaded', className: 'text-emerald-700' }
    : { text: '⚠ required', className: 'text-amber-700' };
}

export function DepositRefundRequestForm({
  bookingId,
  customerId,
  refundableBalancePaise,
  estimatedDeductionPaise = 0,
  settlementPreview = null,
  exitBrainSnapshot = null,
  onSubmitted,
  compact = false,
}: {
  bookingId: string;
  customerId?: string;
  refundableBalancePaise: number;
  estimatedDeductionPaise?: number;
  settlementPreview?: DepositRefundSettlementPreview | null;
  exitBrainSnapshot?: ResidentExitBrainSnapshot | null;
  onSubmitted?: () => void;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(submitDepositRefundRequestAction, idle);
  const [meterUrl, setMeterUrl] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [uploadingMeter, setUploadingMeter] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [highlightMeter, setHighlightMeter] = useState(false);
  const [highlightQr, setHighlightQr] = useState(false);

  const depositHeld = coerceNonNegativePaise(
    settlementPreview?.depositRefundablePaise ??
      settlementPreview?.depositBalancePaise ??
      refundableBalancePaise,
  );
  const unusedPrepaidPaise = coerceNonNegativePaise(settlementPreview?.unusedPrepaidRentPaise ?? 0);
  const totalRefundablePaise =
    settlementPreview?.refundAmountPaise ??
    depositHeld + unusedPrepaidPaise - coerceNonNegativePaise(settlementPreview?.electricityAdjustmentPaise ?? 0);
  const noticeDeduction = coerceNonNegativePaise(estimatedDeductionPaise);
  const meterStatus = uploadStatusLabel(Boolean(meterUrl.trim()));
  const qrStatus = uploadStatusLabel(Boolean(qrUrl.trim()));

  useEffect(() => {
    if (state.ok) onSubmitted?.();
  }, [state.ok, onSubmitted]);

  async function handleMeterFile(file: File | null) {
    if (!file) return;
    setUploadError(null);
    setValidationError(null);
    setHighlightMeter(false);
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
    setValidationError(null);
    setHighlightQr(false);
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const message = getDepositRefundValidationMessage(
      {
        meterReadingPhotoUrl: meterUrl,
        payoutQrUrl: qrUrl,
      },
      { expectedRefundPaise: totalRefundablePaise },
    );
    if (message) {
      event.preventDefault();
      setValidationError(message);
      setHighlightMeter(!meterUrl.trim());
      setHighlightQr(!qrUrl.trim() && totalRefundablePaise > 0);
      return;
    }
    setValidationError(null);
    setHighlightMeter(false);
    setHighlightQr(false);
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className={compact ? 'rounded-xl border border-zinc-200 bg-white p-5' : 'rounded-lg border border-zinc-200 bg-zinc-50 p-4'}
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="meterReadingPhotoUrl" value={meterUrl} />
      <input type="hidden" name="payoutQrUrl" value={qrUrl} />

      <h4 className="text-sm font-semibold text-zinc-900">Request deposit refund</h4>
      <p className="mt-1 text-xs text-zinc-600">
        Upload your final AC meter photo and payment QR image. Admin will verify and confirm your
        final refund.
      </p>

      {exitBrainSnapshot ? (
        <div className="mt-4">
          <ExitBrainRefundBreakdown
            snapshot={exitBrainSnapshot}
            theme="light"
            title="Confirm your refund estimate"
          />
        </div>
      ) : null}

      {settlementPreview && (unusedPrepaidPaise > 0 || settlementPreview.electricityAdjustmentPaise != null) ? (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-700">
          <p className="font-semibold text-zinc-900">Estimated checkout refund</p>
          <ul className="mt-2 space-y-1">
            <li className="flex justify-between gap-2">
              <span>Security deposit refundable</span>
              <span className="tabular-nums">{paiseToInr(depositHeld)}</span>
            </li>
            {unusedPrepaidPaise > 0 ? (
              <li className="flex justify-between gap-2">
                <span>Unused prepaid rent</span>
                <span className="tabular-nums">{paiseToInr(unusedPrepaidPaise)}</span>
              </li>
            ) : null}
            {settlementPreview.electricityAdjustmentPaise != null &&
            settlementPreview.electricityAdjustmentPaise > 0 ? (
              <li className="flex justify-between gap-2">
                <span>Electricity deduction</span>
                <span className="tabular-nums text-rose-700">
                  −{paiseToInr(settlementPreview.electricityAdjustmentPaise)}
                </span>
              </li>
            ) : settlementPreview.electricityPending ? (
              <li>{PENDING_ELECTRICITY_LABEL}</li>
            ) : null}
            {settlementPreview.refundAmountPaise != null ? (
              <li className="flex justify-between gap-2 border-t border-zinc-200 pt-1 font-semibold text-zinc-900">
                <span>Total refundable</span>
                <span className="tabular-nums">{paiseToInr(settlementPreview.refundAmountPaise)}</span>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {noticeDeduction > 0 && !compact && !exitBrainSnapshot ? (
        <p className="mt-2 text-xs text-zinc-600">
          Estimated notice deduction: {paiseToInr(noticeDeduction)} (final amount confirmed at
          settlement).
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="flex items-center justify-between gap-2 text-xs font-semibold text-zinc-800">
            <span>
              Final AC meter photo <span className="text-rose-600">*</span>
            </span>
            <span className={`font-medium ${meterStatus.className}`}>{meterStatus.text}</span>
          </span>
          <ImageFileInputInline
            disabled={uploadingMeter}
            onFileSelected={(file) => void handleMeterFile(file ?? null)}
            className={`mt-1 block w-full text-xs text-zinc-600 ${
              highlightMeter ? 'rounded-lg ring-2 ring-rose-400' : ''
            }`}
          />
        </label>

        <label className="block">
          <span className="flex items-center justify-between gap-2 text-xs font-semibold text-zinc-800">
            <span>
              Payment QR image for refund <span className="text-rose-600">*</span>
            </span>
            <span className={`font-medium ${qrStatus.className}`}>{qrStatus.text}</span>
          </span>
          <ImageFileInputInline
            disabled={uploadingQr}
            onFileSelected={(file) => void handleQrFile(file ?? null)}
            className={`mt-1 block w-full text-xs text-zinc-600 ${
              highlightQr ? 'rounded-lg ring-2 ring-rose-400' : ''
            }`}
          />
        </label>
      </div>

      {uploadError ? <p className="mt-2 text-xs text-rose-600">{uploadError}</p> : null}
      {validationError ? <p className="mt-2 text-xs text-rose-600">{validationError}</p> : null}
      {state.error ? <p className="mt-2 text-xs text-rose-600">{state.error}</p> : null}
      {state.ok ? (
        <p className="mt-2 text-xs text-emerald-700">
          Refund request submitted — we will review and confirm your final amount.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || uploadingMeter || uploadingQr}
        className={`${primaryBtn} mt-4 w-full`}
      >
        {pending ? 'Submitting…' : 'Submit refund request'}
      </button>
    </form>
  );
}
