'use client';

import { useEffect, useMemo, useState } from 'react';
import { useActionState } from 'react';
import {
  calculateRefundElectricityAction,
  reviewResidentRequestAction,
  type RefundElectricityActionState,
  type ReviewRequestState,
} from '@/app/(admin)/admin/requests/actions';
import { DepositWalletSummary } from '@/src/components/admin/DepositWalletSummary';
import { validateDepositRefundSubmission } from '@/src/lib/billing/depositRefundRequirements';
import { adminResidentRequestImageUrl } from '@/src/lib/residents/residentRequestImages';
import { computeRefundDeductions } from '@/src/lib/refundDeductions';
import { paiseToInr, titleCase } from '@/src/lib/format';
import type { DepositSummary } from '@/src/services/deposits';

function parseInrToPaise(value: string): number {
  const n = parseFloat(value.replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function ResidentRequestReviewPanel({
  request,
  depositWallet,
}: {
  request: {
    id: string;
    type: string;
    status: string;
    amountPaise: number | null;
    requestedEndDate: string | null;
    customerName: string;
    customerPhone: string;
    customerId: string;
    bookingId: string;
    bookingCode?: string | null;
    pgName: string;
    createdAt: Date;
    meterReadingPhotoUrl?: string | null;
    useAverageBillingFallback?: boolean;
    payoutUpiId?: string | null;
    payoutQrUrl?: string | null;
    notes?: string | null;
  };
  depositWallet: DepositSummary | null;
}) {
  const [state, action, pending] = useActionState(reviewResidentRequestAction, {
    ok: false,
  } satisfies ReviewRequestState);

  const [elecState, elecAction, elecPending] = useActionState(
    calculateRefundElectricityAction,
    null as RefundElectricityActionState | null,
  );

  const [elecCost, setElecCost] = useState('12');
  const [elecUnits, setElecUnits] = useState('');
  const [damage, setDamage] = useState('');
  const [cleaning, setCleaning] = useState('');
  const [penalty, setPenalty] = useState('');
  const [custom, setCustom] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [refundMethod, setRefundMethod] = useState('UPI');

  useEffect(() => {
    if (elecState?.ok) {
      setElecCost(String(elecState.ratePerUnitPaise / 100));
      setElecUnits(String(elecState.units));
    }
  }, [elecState]);

  const held =
    depositWallet?.refundableBalancePaise ??
    (request.amountPaise ?? 0);

  const submissionValid = useMemo(
    () =>
      validateDepositRefundSubmission({
        meterReadingPhotoUrl: request.meterReadingPhotoUrl,
        payoutUpiId: request.payoutUpiId,
        payoutQrUrl: request.payoutQrUrl,
      }),
    [request.meterReadingPhotoUrl, request.payoutUpiId, request.payoutQrUrl],
  );

  const preview = useMemo(
    () =>
      computeRefundDeductions(held, {
        electricityUnitCostPaise: parseInrToPaise(elecCost),
        electricityUnits: parseInt(elecUnits, 10) || 0,
        damageChargePaise: parseInrToPaise(damage),
        cleaningChargePaise: parseInrToPaise(cleaning),
        penaltyChargePaise: parseInrToPaise(penalty),
        customChargePaise: parseInrToPaise(custom),
        customChargeLabel: customLabel || undefined,
      }),
    [held, elecCost, elecUnits, damage, cleaning, penalty, custom, customLabel],
  );

  const typeLabel =
    request.type === 'deposit_refund'
      ? 'Deposit refund'
      : request.type === 'deposit_due_extension'
        ? 'Deposit due extension'
        : request.type === 'stay_extension'
          ? 'Stay extension (legacy)'
          : titleCase(request.type.replace(/_/g, ' '));

  return (
    <form action={action} className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <input type="hidden" name="requestId" value={request.id} />
      <h3 className="text-sm font-semibold text-white">
        {typeLabel} — {request.customerName}
      </h3>
      <p className="mt-1 text-xs text-apg-silver">
        {request.pgName} · {request.customerPhone} · {titleCase(request.status)}
        {request.bookingCode ? (
          <>
            {' '}
            · <span className="font-mono">{request.bookingCode}</span>
          </>
        ) : null}
      </p>

      {request.type === 'deposit_refund' ? (
        <div className="mt-4 space-y-4">
          {depositWallet ? (
            <>
              <DepositWalletSummary wallet={depositWallet} bookingId={request.bookingId} compact />
              {depositWallet.entries.filter((e) => e.entryKind === 'deducted').length > 0 ? (
                <div className="rounded-xl border border-white/10 bg-[#12161C] p-3">
                  <p className="text-xs font-semibold text-white">Wallet deductions</p>
                  <ul className="mt-2 space-y-1 text-xs text-apg-silver">
                    {depositWallet.entries
                      .filter((e) => e.entryKind === 'deducted')
                      .map((e) => (
                        <li key={e.id} className="flex justify-between gap-2">
                          <span>{e.reason}</span>
                          <span className="tabular-nums text-rose-300">
                            −{paiseToInr(Math.abs(e.amountPaise))}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="rounded-xl border border-white/10 bg-[#12161C] p-4">
            <p className="text-sm font-semibold text-white">Refund submission</p>
            <ul className="mt-2 space-y-1 text-xs text-apg-silver">
              <li>
                Meter photo:{' '}
                {request.meterReadingPhotoUrl ? (
                  <a
                    href={adminResidentRequestImageUrl(request.id, 'meter')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-300 underline"
                  >
                    View photo
                  </a>
                ) : (
                  <span className="text-rose-300">Missing</span>
                )}
              </li>
              <li>
                UPI ID:{' '}
                {request.payoutUpiId ? (
                  <span className="font-mono text-white">{request.payoutUpiId}</span>
                ) : (
                  <span className="text-apg-silver">—</span>
                )}
              </li>
              <li>
                UPI QR:{' '}
                {request.payoutQrUrl ? (
                  <a
                    href={adminResidentRequestImageUrl(request.id, 'refund_qr')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-300 underline"
                  >
                    View QR
                  </a>
                ) : (
                  <span className="text-apg-silver">—</span>
                )}
              </li>
            </ul>
            {!submissionValid.ok ? (
              <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                Cannot approve — {submissionValid.error}
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-white/10 bg-[#12161C] p-4">
            <p className="text-sm font-semibold text-white">Electricity before approval</p>
            <p className="mt-1 text-xs text-apg-silver">
              Fetch meter readings from the room history, then generate the electricity invoice
              before deducting from the deposit wallet.
            </p>
            <form action={elecAction} className="mt-3 space-y-3">
              <input type="hidden" name="bookingId" value={request.bookingId} />
              <button
                type="submit"
                disabled={elecPending}
                className="rounded-lg border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
              >
                {elecPending ? 'Calculating…' : 'Calculate electricity before approval'}
              </button>
            </form>
            {elecState?.ok === false ? (
              <p className="mt-2 text-xs text-rose-300">{elecState.error}</p>
            ) : null}
            {elecState?.ok ? (
              <p className="mt-2 text-xs text-emerald-300">
                {elecState.message} — {elecState.units} units @ ₹
                {(elecState.ratePerUnitPaise / 100).toFixed(2)} ={' '}
                {paiseToInr(elecState.amountPaise)}
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-white/10 bg-[#12161C] p-4">
            <p className="text-sm font-semibold text-white">Refund breakdown preview</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-apg-silver">
              Electricity unit cost (₹)
              <input
                type="number"
                step="0.01"
                min="0"
                value={elecCost}
                onChange={(e) => setElecCost(e.target.value)}
                className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0d1015] px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="text-xs text-apg-silver">
              Units consumed
              <input
                type="number"
                min="0"
                value={elecUnits}
                onChange={(e) => setElecUnits(e.target.value)}
                className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0d1015] px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="text-xs text-apg-silver">
              Damage charge (₹)
              <input
                type="number"
                min="0"
                step="0.01"
                value={damage}
                onChange={(e) => setDamage(e.target.value)}
                className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0d1015] px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="text-xs text-apg-silver">
              Cleaning charge (₹)
              <input
                type="number"
                min="0"
                step="0.01"
                value={cleaning}
                onChange={(e) => setCleaning(e.target.value)}
                className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0d1015] px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="text-xs text-apg-silver">
              Penalty (₹)
              <input
                type="number"
                min="0"
                step="0.01"
                value={penalty}
                onChange={(e) => setPenalty(e.target.value)}
                className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0d1015] px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="text-xs text-apg-silver">
              Custom charge (₹)
              <input
                type="number"
                min="0"
                step="0.01"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0d1015] px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="text-xs text-apg-silver sm:col-span-2">
              Custom charge label
              <input
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="e.g. Key replacement"
                className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0d1015] px-2 py-1.5 text-sm text-white"
              />
            </label>
            </div>

            <div className="mt-3 rounded-lg border border-white/10 p-3 text-xs text-apg-silver">
              <p>Electricity deduction: {paiseToInr(preview.electricityDeductionPaise ?? 0)}</p>
              <p>Other charges: {paiseToInr(preview.otherDeductionsPaise ?? 0)}</p>
              <p className="mt-2 text-sm font-semibold text-emerald-300">
                Final refund: {paiseToInr(preview.finalRefundPaise)}
              </p>
            </div>

            <input type="hidden" name="electricityUnitCostPaise" value={parseInrToPaise(elecCost)} />
          <input type="hidden" name="electricityUnits" value={parseInt(elecUnits, 10) || 0} />
          <input type="hidden" name="damageChargePaise" value={parseInrToPaise(damage)} />
          <input type="hidden" name="cleaningChargePaise" value={parseInrToPaise(cleaning)} />
          <input type="hidden" name="penaltyChargePaise" value={parseInrToPaise(penalty)} />
          <input type="hidden" name="customChargePaise" value={parseInrToPaise(custom)} />
          <input type="hidden" name="customChargeLabel" value={customLabel} />

          {request.status === 'approved' ? (
            <label className="block text-xs text-apg-silver">
              Refund method
              <select
                name="refundMethod"
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value)}
                className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0d1015] px-2 py-1.5 text-sm text-white"
              >
                <option value="UPI">UPI</option>
                <option value="Bank transfer">Bank transfer</option>
                <option value="Cash">Cash</option>
                <option value="Other">Other</option>
              </select>
            </label>
          ) : null}
          </div>
        </div>
      ) : (
        <>
          {request.amountPaise ? (
            <p className="mt-2 text-sm text-white">Amount: {paiseToInr(request.amountPaise)}</p>
          ) : null}
          {request.requestedEndDate ? (
            <p className="mt-1 text-sm text-white">Requested until: {request.requestedEndDate}</p>
          ) : null}
        </>
      )}

      <label className="mt-4 block text-sm">
        <span className="text-apg-silver">Admin notes</span>
        <textarea
          name="adminNotes"
          rows={2}
          className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
        />
      </label>

      {state.error ? <p className="mt-2 text-sm text-rose-300">{state.error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {request.status === 'submitted' ? (
          <button
            type="submit"
            name="action"
            value="under_review"
            disabled={pending}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
          >
            Mark under review
          </button>
        ) : null}
        {['submitted', 'under_review'].includes(request.status) ? (
          <button
            type="submit"
            name="action"
            value="approve"
            disabled={
              pending ||
              (request.type === 'deposit_refund' && !submissionValid.ok)
            }
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            title={
              request.type === 'deposit_refund' && !submissionValid.ok
                ? submissionValid.error
                : undefined
            }
          >
            Approve
          </button>
        ) : null}
        {request.status === 'approved' && request.type === 'deposit_refund' ? (
          <button
            type="submit"
            name="action"
            value="complete"
            disabled={pending || !submissionValid.ok}
            className="rounded-lg bg-[#FF5A1F] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            Proceed to refund
          </button>
        ) : null}
        {!['rejected', 'completed'].includes(request.status) ? (
          <button
            type="submit"
            name="action"
            value="reject"
            disabled={pending}
            className="rounded-lg border border-rose-400/40 px-3 py-2 text-xs font-medium text-rose-300"
          >
            Reject
          </button>
        ) : null}
        <a
          href={`/admin/residents/${request.customerId}`}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs text-apg-silver hover:text-white"
        >
          Resident profile →
        </a>
        <a
          href={`/admin/deposits/${request.bookingId}`}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs text-apg-silver hover:text-white"
        >
          Deposit ledger →
        </a>
      </div>
    </form>
  );
}
