'use client';

import { useEffect, useMemo, useState } from 'react';
import { rejectPaymentProofAction } from '@/app/(admin)/admin/payments/actions';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import {
  PAYMENT_PROOF_REJECTION_DIALOG_REASONS,
  PAYMENT_PROOF_REJECTION_QUICK_ACTIONS,
  PAYMENT_PROOF_REJECTION_REASONS,
  buildResidentRejectionMessage,
  defaultRejectionReasonCode,
  hasUploadedPaymentScreenshot,
  type PaymentProofRejectionReasonCode,
} from '@/src/lib/approvals/paymentProofRejectionReasons';
import { formatIndianPhoneDisplay } from '@/src/lib/phone';

type Props = {
  item: PendingPaymentReviewItem;
  open: boolean;
  onClose: () => void;
  onRejected: (result: { nextKey?: string | null; whatsappUrl?: string }) => void;
};

type Step = 'confirm' | 'details';

function reasonLabel(code: PaymentProofRejectionReasonCode): string {
  return PAYMENT_PROOF_REJECTION_REASONS.find((r) => r.code === code)?.label ?? code;
}

export function PaymentProofRejectionDialog({ item, open, onClose, onRejected }: Props) {
  const [step, setStep] = useState<Step>('confirm');
  const [reasonCode, setReasonCode] = useState<PaymentProofRejectionReasonCode>(
    'incorrect_screenshot',
  );
  const [reasonDetail, setReasonDetail] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [residentMessage, setResidentMessage] = useState('');
  const [messageTouched, setMessageTouched] = useState(false);
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const billLabel = useMemo(() => item.title || item.paymentTypeLabel, [item]);
  const hasScreenshot = hasUploadedPaymentScreenshot(item.screenshotUrl);

  useEffect(() => {
    if (!open) return;
    const initialReason = defaultRejectionReasonCode(item.screenshotUrl);
    setStep('confirm');
    setReasonCode(initialReason);
    setReasonDetail('');
    setAdminNote('');
    setMessageTouched(false);
    setSendWhatsApp(true);
    setError(null);
    setResidentMessage(
      buildResidentRejectionMessage({
        reasonCode: initialReason,
        residentName: item.residentName,
        billLabel,
        amountPaise: item.amountPaise,
      }),
    );
    // #region agent log
    fetch('http://127.0.0.1:7596/ingest/7ac86f2a-cbab-4d25-8804-7532d754a1bb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2142b1' },
      body: JSON.stringify({
        sessionId: '2142b1',
        runId: 'reject-ux',
        hypothesisId: 'A',
        location: 'PaymentProofRejectionDialog.tsx:open',
        message: 'Reject dialog opened',
        data: {
          hasScreenshot,
          screenshotLen: item.screenshotUrl?.trim().length ?? 0,
          initialReason,
          step: 'confirm',
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [open, item.residentName, billLabel, item.amountPaise, item.screenshotUrl, hasScreenshot]);

  useEffect(() => {
    if (!open || messageTouched) return;
    setResidentMessage(
      buildResidentRejectionMessage({
        reasonCode,
        reasonDetail: reasonCode === 'other' ? reasonDetail : undefined,
        residentName: item.residentName,
        billLabel,
        amountPaise: item.amountPaise,
      }),
    );
  }, [
    open,
    messageTouched,
    reasonCode,
    reasonDetail,
    item.residentName,
    billLabel,
    item.amountPaise,
  ]);

  if (!open) return null;

  function applyReason(code: PaymentProofRejectionReasonCode, opts?: { fromQuick?: boolean }) {
    setReasonCode(code);
    setMessageTouched(false);
    setError(null);
    if (code !== 'other') setReasonDetail('');
    setResidentMessage(
      buildResidentRejectionMessage({
        reasonCode: code,
        reasonDetail: code === 'other' ? reasonDetail : undefined,
        residentName: item.residentName,
        billLabel,
        amountPaise: item.amountPaise,
      }),
    );
    // #region agent log
    fetch('http://127.0.0.1:7596/ingest/7ac86f2a-cbab-4d25-8804-7532d754a1bb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2142b1' },
      body: JSON.stringify({
        sessionId: '2142b1',
        runId: 'reject-ux',
        hypothesisId: 'D',
        location: 'PaymentProofRejectionDialog.tsx:applyReason',
        message: 'Reason applied',
        data: { code, fromQuick: Boolean(opts?.fromQuick), step },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }

  function handleContinue() {
    if (reasonCode === 'other' && !reasonDetail.trim()) {
      setError('Please describe the reason when selecting Other.');
      return;
    }
    setError(null);
    setStep('details');
    // #region agent log
    fetch('http://127.0.0.1:7596/ingest/7ac86f2a-cbab-4d25-8804-7532d754a1bb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2142b1' },
      body: JSON.stringify({
        sessionId: '2142b1',
        runId: 'reject-ux',
        hypothesisId: 'C',
        location: 'PaymentProofRejectionDialog.tsx:continue',
        message: 'Advanced to details step',
        data: { reasonCode, hasScreenshot },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }

  async function handleReject() {
    setPending(true);
    setError(null);
    try {
      const result = await rejectPaymentProofAction({
        reviewKey: item.key,
        kind: item.kind,
        entityId: item.entityId,
        pgId: item.pgId,
        reasonCode,
        reasonDetail: reasonCode === 'other' ? reasonDetail : undefined,
        adminNote: adminNote.trim() || undefined,
        residentMessage: residentMessage.trim(),
        sendWhatsApp,
      });
      if (!result.ok) {
        setError(result.message ?? 'Rejection failed.');
        return;
      }
      if (result.message) {
        setError(result.message);
      }
      onRejected({ nextKey: result.nextKey, whatsappUrl: result.whatsappUrl });
      if (result.whatsappUrl && sendWhatsApp) {
        window.open(result.whatsappUrl, '_blank', 'noopener,noreferrer');
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal
        aria-labelledby="reject-payment-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#1A1F27] shadow-2xl"
      >
        <div className="border-b border-white/10 px-5 py-4">
          <h2 id="reject-payment-title" className="text-lg font-semibold text-white">
            Reject Payment
          </h2>
          <p className="mt-1 text-sm text-apg-silver">
            {item.residentName} · {billLabel}
          </p>
          {!hasScreenshot ? (
            <p className="mt-2 text-xs text-amber-200/90">
              No payment screenshot on file — defaulted to “Payment screenshot not uploaded”.
            </p>
          ) : null}
        </div>

        {step === 'confirm' ? (
          <div className="space-y-4 px-5 py-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">
                Quick Reject
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PAYMENT_PROOF_REJECTION_QUICK_ACTIONS.map((action) => {
                  const active = reasonCode === action.code;
                  return (
                    <button
                      key={action.code}
                      type="button"
                      onClick={() => applyReason(action.code, { fromQuick: true })}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        active
                          ? 'border-rose-400/50 bg-rose-500/20 text-rose-100'
                          : 'border-white/10 bg-white/5 text-apg-silver hover:border-white/20 hover:text-white'
                      }`}
                    >
                      {action.buttonLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block text-sm">
              <span className="font-medium text-white">
                Reason <span className="text-rose-400">*</span>
              </span>
              <select
                value={reasonCode}
                onChange={(e) =>
                  applyReason(e.target.value as PaymentProofRejectionReasonCode)
                }
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0f1318] px-3 py-2 text-sm text-white"
              >
                {PAYMENT_PROOF_REJECTION_DIALOG_REASONS.map((code) => (
                  <option key={code} value={code}>
                    {reasonLabel(code)}
                  </option>
                ))}
              </select>
            </label>

            {reasonCode === 'other' ? (
              <label className="block text-sm">
                <span className="font-medium text-white">
                  Describe reason <span className="text-rose-400">*</span>
                </span>
                <input
                  type="text"
                  value={reasonDetail}
                  onChange={(e) => setReasonDetail(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0f1318] px-3 py-2 text-sm text-white"
                  placeholder="Brief reason for the resident"
                />
              </label>
            ) : null}

            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          </div>
        ) : (
          <div className="space-y-4 px-5 py-4">
            <div className="rounded-lg border border-white/10 bg-[#141820] px-3 py-2 text-sm">
              <p className="text-xs text-apg-silver">Rejection reason</p>
              <p className="font-medium text-white">{reasonLabel(reasonCode)}</p>
              {reasonCode === 'other' && reasonDetail.trim() ? (
                <p className="mt-1 text-xs text-apg-silver">{reasonDetail.trim()}</p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep('confirm');
                }}
                className="mt-2 text-xs font-medium text-sky-300 hover:text-sky-200"
              >
                Change reason
              </button>
            </div>

            <label className="block text-sm">
              <span className="font-medium text-white">Internal admin note</span>
              <span className="ml-2 text-xs text-apg-silver">(admin only — audit history)</span>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                rows={2}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0f1318] px-3 py-2 text-sm text-white"
                placeholder="Optional note for your team"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-white">Resident message</span>
              <textarea
                value={residentMessage}
                onChange={(e) => {
                  setMessageTouched(true);
                  setResidentMessage(e.target.value);
                }}
                rows={8}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0f1318] px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-[#141820] px-3 py-3">
              <input
                type="checkbox"
                checked={sendWhatsApp}
                onChange={(e) => setSendWhatsApp(e.target.checked)}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-medium text-white">Send WhatsApp message</p>
                <p className="text-xs text-apg-silver">
                  {item.phone
                    ? `Opens WhatsApp to ${formatIndianPhoneDisplay(item.phone)} after rejection`
                    : 'No phone on file — notification will still be sent in-app'}
                </p>
              </div>
            </label>

            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-apg-silver hover:text-white"
          >
            Cancel
          </button>
          {step === 'confirm' ? (
            <button
              type="button"
              disabled={pending}
              onClick={handleContinue}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => void handleReject()}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
            >
              {pending ? 'Rejecting…' : 'Reject payment'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
