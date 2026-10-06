'use client';

import { useActionState, useEffect, useState, type FormEvent } from 'react';
import {
  submitResidentRefundNowRequestAction,
  type RequestActionState,
} from '@/app/(customer)/account/resident/request-actions';
import { ImageFileInputInline } from '@/src/components/shared/ImageFileInput';
import {
  uploadDepositRefundEvidenceClient,
  type DepositRefundEvidenceUploadPhase,
} from '@/src/lib/client/uploadDepositRefundEvidenceClient';
import { validateProofUploadFile } from '@/src/lib/payments/proofUploadLimits';
import { paiseToInr } from '@/src/lib/format';
import { primaryBtn } from '@/src/lib/design-system/tokens';
import type { ResidentRefundableNow } from '@/src/lib/billing/residentRefundableNow';

const idle: RequestActionState = { ok: false };

export function RefundAvailableNowForm({
  bookingId,
  customerId,
  refundableNow,
  onSubmitted,
}: {
  bookingId: string;
  customerId: string;
  refundableNow: ResidentRefundableNow;
  onSubmitted?: () => void;
}) {
  const [state, formAction, pending] = useActionState(submitResidentRefundNowRequestAction, idle);
  const [qrUrl, setQrUrl] = useState('');
  const [uploadingQr, setUploadingQr] = useState(false);
  const [qrUploadPhase, setQrUploadPhase] = useState<DepositRefundEvidenceUploadPhase | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [amountRupees, setAmountRupees] = useState('');

  const maxPaise = refundableNow.totalRefundableNowPaise;
  const defaultRupees = (maxPaise / 100).toFixed(2);

  useEffect(() => {
    if (state.ok) onSubmitted?.();
  }, [state.ok, onSubmitted]);

  async function handleQrFile(file: File | null) {
    if (!file) return;
    const immediateError = validateProofUploadFile(file);
    if (immediateError) {
      setUploadError(immediateError);
      return;
    }
    setUploadError(null);
    setUploadingQr(true);
    try {
      const result = await uploadDepositRefundEvidenceClient(
        file,
        { uploadType: 'refund_qr', bookingId },
        setQrUploadPhase,
      );
      setQrUrl(result.url);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploadingQr(false);
      setQrUploadPhase(null);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = Number.parseFloat(amountRupees.replace(/,/g, '') || defaultRupees);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setUploadError('Enter a valid refund amount.');
      return;
    }
    const requestedTotalPaise = Math.round(parsed * 100);
    if (requestedTotalPaise > maxPaise) {
      setUploadError(`Maximum available is ${paiseToInr(maxPaise)}.`);
      return;
    }
    if (!qrUrl.trim()) {
      setUploadError('Upload your UPI QR image to receive the refund.');
      return;
    }
    const fd = new FormData(e.currentTarget);
    fd.set('bookingId', bookingId);
    fd.set('requestedTotalPaise', String(requestedTotalPaise));
    fd.set('payoutQrUrl', qrUrl);
    formAction(fd);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
        <p className="font-semibold text-white">Refund available now</p>
        <ul className="mt-3 space-y-2">
          <li className="flex justify-between gap-2">
            <span className="text-apg-silver">Unused prepaid rent — refundable now</span>
            <span className="tabular-nums text-emerald-300">
              {paiseToInr(refundableNow.prepaidRentRefundableNowPaise)}
            </span>
          </li>
          <li className="flex justify-between gap-2">
            <span className="text-apg-silver">Refundable deposit excess</span>
            <span className="tabular-nums text-white">
              {paiseToInr(refundableNow.depositRefundableNowPaise)}
            </span>
          </li>
          <li className="flex justify-between gap-2 border-t border-white/10 pt-2 font-semibold">
            <span className="text-white">Total available to request</span>
            <span className="tabular-nums text-apg-orange">{paiseToInr(maxPaise)}</span>
          </li>
        </ul>
        {refundableNow.requiredDepositLockedPaise > 0 ? (
          <p className="mt-3 text-[11px] text-apg-silver">
            Required deposit locked until checkout:{' '}
            {paiseToInr(refundableNow.requiredDepositLockedPaise)}
          </p>
        ) : null}
      </div>

      <label className="block text-xs text-apg-silver">
        Amount to request (₹)
        <input
          name="amountDisplay"
          type="text"
          inputMode="decimal"
          className="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white"
          placeholder={defaultRupees}
          value={amountRupees}
          onChange={(e) => setAmountRupees(e.target.value)}
        />
      </label>

      <div>
        <p className="text-xs font-medium text-white">UPI QR for payout</p>
        <ImageFileInputInline
          onFileSelected={(file) => void handleQrFile(file ?? null)}
          disabled={uploadingQr || pending}
        />
        <p className={`mt-1 text-[11px] ${qrUrl ? 'text-emerald-400' : 'text-amber-300'}`}>
          {uploadingQr
            ? qrUploadPhase === 'preparing'
              ? 'Preparing…'
              : 'Uploading…'
            : qrUrl
              ? '✓ QR uploaded'
              : 'Required'}
        </p>
      </div>

      {uploadError ? <p className="text-sm text-rose-300">{uploadError}</p> : null}
      {state.error ? <p className="text-sm text-rose-300">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending || uploadingQr || maxPaise <= 0}
        className={`${primaryBtn} w-full disabled:opacity-50`}
      >
        {pending ? 'Submitting…' : 'Submit refund request'}
      </button>
      <input type="hidden" name="customerId" value={customerId} />
    </form>
  );
}
