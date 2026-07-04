'use client';

import { useEffect, useMemo, useState } from 'react';
import { rejectPaymentProofAction } from '@/app/(admin)/admin/payments/actions';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import {
  PAYMENT_PROOF_REJECTION_REASONS,
  buildResidentRejectionMessage,
  type PaymentProofRejectionReasonCode,
} from '@/src/lib/approvals/paymentProofRejectionReasons';
import { formatIndianPhoneDisplay } from '@/src/lib/phone';

type Props = {
  item: PendingPaymentReviewItem;
  open: boolean;
  onClose: () => void;
  onRejected: (result: { nextKey?: string | null; whatsappUrl?: string }) => void;
};

export function PaymentProofRejectionDialog({ item, open, onClose, onRejected }: Props) {
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

  useEffect(() => {
    if (!open) return;
    setReasonCode('incorrect_screenshot');
    setReasonDetail('');
    setAdminNote('');
    setMessageTouched(false);
    setSendWhatsApp(true);
    setError(null);
    setResidentMessage(
      buildResidentRejectionMessage({
        reasonCode: 'incorrect_screenshot',
        residentName: item.residentName,
        billLabel,
        amountPaise: item.amountPaise,
      }),
    );
  }, [open, item.residentName, billLabel, item.amountPaise]);

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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#1A1F27] shadow-2xl"
      >
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">Reject payment proof</h2>
          <p className="mt-1 text-sm text-apg-silver">
            {item.residentName} · {billLabel}
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <label className="block text-sm">
            <span className="font-medium text-white">
              Rejection reason <span className="text-rose-400">*</span>
            </span>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as PaymentProofRejectionReasonCode)}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0f1318] px-3 py-2 text-sm text-white"
            >
              {PAYMENT_PROOF_REJECTION_REASONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
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

        <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-apg-silver hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void handleReject()}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
          >
            {pending ? 'Rejecting…' : 'Reject payment'}
          </button>
        </div>
      </div>
    </div>
  );
}
