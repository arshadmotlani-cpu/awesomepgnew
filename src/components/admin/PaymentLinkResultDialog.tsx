'use client';

import { useCallback, useState } from 'react';
import { paiseToInr } from '@/src/lib/format';

type Props = {
  open: boolean;
  onClose: () => void;
  residentName: string;
  amountPaise: number;
  publicUrl: string;
  reused?: boolean;
};

export function PaymentLinkResultDialog({
  open,
  onClose,
  residentName,
  amountPaise,
  publicUrl,
  reused,
}: Props) {
  const [copied, setCopied] = useState(false);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy payment link:', publicUrl);
    }
  }, [publicUrl]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-link-dialog-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1A1F27] p-5 shadow-xl">
        <h2 id="payment-link-dialog-title" className="text-lg font-semibold text-white">
          Deposit payment link ready
        </h2>
        <p className="mt-1 text-sm text-apg-silver">
          {reused ? 'Reused existing link' : 'New link created'} for{' '}
          <span className="text-white">{residentName}</span> ·{' '}
          <span className="font-medium text-emerald-300">{paiseToInr(amountPaise)}</span>
        </p>

        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-apg-silver">
          Resident payment link
        </label>
        <div className="mt-1 flex gap-2">
          <input
            readOnly
            value={publicUrl}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-xs text-white"
          />
          <button
            type="button"
            onClick={copyLink}
            className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <p className="mt-3 text-xs text-apg-silver">
          Share this link with the resident on WhatsApp. They can open it on their phone to scan the
          UPI QR — no admin login required.
        </p>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-apg-silver hover:text-white"
          >
            Close
          </button>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Preview link
          </a>
        </div>
      </div>
    </div>
  );
}
