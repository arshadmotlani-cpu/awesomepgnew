'use client';

import { useId, useState } from 'react';
import { logPaymentClientException } from '@/src/lib/client/paymentClientLogger';

type SubmitResult = { ok: boolean; message?: string };

export function UpiPaymentProofForm({
  amountLabel,
  heading = 'Pay via QR + enter transaction ID',
  instructions,
  qrImageUrl,
  upiId,
  existingTransactionRef,
  rejectionReason,
  rejectionMessage,
  submitProof,
  doneMessage = 'Payment submitted. An admin will verify the transaction ID and mark it paid.',
  variant = 'dark',
  qrFootnote,
  logContext,
}: {
  amountLabel: string;
  heading?: string;
  instructions?: string;
  qrImageUrl?: string | null;
  upiId?: string | null;
  /** When set and no rejection, treat as already submitted. */
  existingTransactionRef?: string | null;
  rejectionReason?: string | null;
  rejectionMessage?: string | null;
  submitProof: (args: {
    transactionRef: string;
    screenshotUrl?: string | null;
  }) => Promise<SubmitResult>;
  doneMessage?: string;
  /** Light surfaces for booking checkout; dark glass for resident dashboard. */
  variant?: 'light' | 'dark';
  qrFootnote?: string;
  logContext?: {
    page: string;
    invoiceId?: string;
    bookingId?: string;
    residentId?: string;
    paymentLinkId?: string;
    membershipId?: string;
    extensionId?: string;
    pgId?: string;
    uploadType?:
      | 'payment_proof'
      | 'booking_payment'
      | 'electricity_payment'
      | 'extension_payment'
      | 'deposit_link'
      | 'ps4_payment';
  };
}) {
  const isLight = variant === 'light';
  const inputId = useId();
  const [transactionRef, setTransactionRef] = useState(existingTransactionRef ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(Boolean(existingTransactionRef?.trim()) && !rejectionReason);
  const [qrFailed, setQrFailed] = useState(false);
  const [qrNonce, setQrNonce] = useState(0);

  const rejectionBanner =
    rejectionReason || rejectionMessage ? (
      <div
        className={
          isLight
            ? 'rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900'
            : 'rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-100'
        }
      >
        <p className={`font-semibold ${isLight ? 'text-rose-800' : 'text-rose-200'}`}>
          Payment rejected
        </p>
        {rejectionReason ? (
          <p className="mt-2">
            <span className="font-medium">Reason:</span> {rejectionReason}
          </p>
        ) : null}
        {rejectionMessage ? (
          <p className={`mt-2 ${isLight ? 'text-rose-800' : 'text-apg-silver'}`}>
            {rejectionMessage}
          </p>
        ) : null}
        <p className={`mt-3 text-xs ${isLight ? 'text-rose-700' : 'text-rose-100/90'}`}>
          Please submit a new transaction ID below.
        </p>
      </div>
    ) : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = transactionRef.trim();
    if (!trimmed) {
      setError('Enter the UPI transaction ID from your payment confirmation.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await submitProof({
        transactionRef: trimmed,
        screenshotUrl: null,
      });
      if (!result.ok) {
        setError(result.message ?? 'Submission failed.');
        return;
      }
      setDone(true);
    } catch (err) {
      logPaymentClientException('Payment proof submit failed', err, {
        page: logContext?.page ?? 'upi-payment-proof',
        invoiceId: logContext?.invoiceId ?? null,
        bookingId: logContext?.bookingId ?? null,
        residentId: logContext?.residentId ?? null,
        paymentLinkId: logContext?.paymentLinkId ?? null,
        membershipId: logContext?.membershipId ?? null,
        extensionId: logContext?.extensionId ?? null,
      });
      setError('Network error. Try again.');
    } finally {
      setPending(false);
    }
  }

  async function copyUpiId() {
    if (!upiId) return;
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(upiId);
    } catch (err) {
      logPaymentClientException('UPI copy failed', err, {
        page: logContext?.page ?? 'upi-payment-proof',
        invoiceId: logContext?.invoiceId ?? null,
        bookingId: logContext?.bookingId ?? null,
        residentId: logContext?.residentId ?? null,
        paymentLinkId: logContext?.paymentLinkId ?? null,
        membershipId: logContext?.membershipId ?? null,
        extensionId: logContext?.extensionId ?? null,
      });
      setError('Could not copy UPI ID. Please copy it manually.');
    }
  }

  if (done) {
    return (
      <div
        className={
          isLight
            ? 'rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
            : 'rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 ring-1 ring-inset ring-emerald-500/20'
        }
      >
        {doneMessage}
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className={
        isLight
          ? 'space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4'
          : 'apg-glass space-y-4 rounded-2xl p-5'
      }
    >
      {rejectionBanner}
      <div>
        <h3 className={`text-base font-semibold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
          {heading}
        </h3>
        <p className={`mt-1 text-sm ${isLight ? 'text-zinc-600' : 'text-zinc-300'}`}>
          Amount:{' '}
          <span className={`font-semibold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
            {amountLabel}
          </span>
          .
          {instructions
            ? ` ${instructions}`
            : ' Scan the QR, pay via UPI, then enter the transaction ID from your UPI app. An admin will verify it.'}
        </p>
      </div>

      {qrImageUrl ? (
        <div className="rounded-xl border border-white/10 bg-white p-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${qrImageUrl}${qrNonce ? `${qrImageUrl.includes('?') ? '&' : '?'}r=${qrNonce}` : ''}`}
            alt="UPI QR code — scan to pay"
            className="mx-auto max-h-52 w-full max-w-xs object-contain"
            onLoad={() => setQrFailed(false)}
            onError={() => {
              setQrFailed(true);
              logPaymentClientException('QR image failed to load', new Error('qr-load-failed'), {
                page: logContext?.page ?? 'upi-payment-proof',
                invoiceId: logContext?.invoiceId ?? null,
                bookingId: logContext?.bookingId ?? null,
                residentId: logContext?.residentId ?? null,
                paymentLinkId: logContext?.paymentLinkId ?? null,
                membershipId: logContext?.membershipId ?? null,
                extensionId: logContext?.extensionId ?? null,
              });
            }}
          />
          {qrFailed ? (
            <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              QR failed to load.
              <button
                type="button"
                className="ml-2 font-semibold underline"
                onClick={() => setQrNonce((n) => n + 1)}
              >
                Retry
              </button>
            </div>
          ) : null}
          {upiId ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm">
              <span className="text-zinc-600">UPI ID:</span>
              <code className="rounded bg-zinc-100 px-2 py-1 text-sm font-semibold text-zinc-900">
                {upiId}
              </code>
              <button
                type="button"
                className="rounded-md bg-[#FF5A1F] px-2.5 py-1 text-xs font-semibold text-white hover:brightness-110"
                onClick={() => void copyUpiId()}
              >
                Copy
              </button>
            </div>
          ) : null}
          {qrFootnote ? (
            <p className={`mt-2 text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
              {qrFootnote}
            </p>
          ) : null}
        </div>
      ) : null}

      <label className="block text-sm" htmlFor={inputId}>
        <span className={`font-medium ${isLight ? 'text-zinc-900' : 'text-white'}`}>
          UPI transaction ID <span className="text-[#FF5A1F]">*</span>
        </span>
        <input
          id={inputId}
          type="text"
          value={transactionRef}
          onChange={(e) => setTransactionRef(e.target.value)}
          placeholder="e.g. 123456789012"
          autoComplete="off"
          required
          className={
            isLight
              ? 'mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900'
              : 'apg-input-dark mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm'
          }
        />
        <span className={`mt-1 block text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
          Copy the reference / UTR from your UPI payment confirmation.
        </span>
      </label>

      <button
        type="submit"
        disabled={pending || !transactionRef.trim()}
        className={
          isLight
            ? 'sticky bottom-0 z-10 w-full rounded-lg bg-[#FF5A1F] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-sm font-semibold text-white shadow-[0_-4px_12px_rgba(0,0,0,0.08)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:static sm:shadow-none'
            : 'apg-glow-btn sticky bottom-0 z-10 w-full rounded-lg bg-[#FF5A1F] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-sm font-semibold text-white shadow-[0_-4px_12px_rgba(0,0,0,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:static sm:shadow-none'
        }
      >
        {pending ? 'Submitting…' : 'Submit payment for approval'}
      </button>

      {error ? (
        <p
          className={
            isLight
              ? 'rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'
              : 'rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200'
          }
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
