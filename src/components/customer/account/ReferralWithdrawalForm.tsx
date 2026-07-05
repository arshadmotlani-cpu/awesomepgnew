'use client';

import { useState } from 'react';
import { primaryBtn } from '@/src/lib/design-system/tokens';
import { paiseToInr } from '@/src/lib/format';

export function ReferralWithdrawalForm({
  customerId,
  availablePaise,
  onSubmitted,
}: {
  customerId: string;
  availablePaise: number;
  onSubmitted?: () => void;
}) {
  const [upiId, setUpiId] = useState('');
  const [amountInr, setAmountInr] = useState(
    availablePaise > 0 ? String(Math.round(availablePaise / 100)) : '',
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (availablePaise <= 0) {
    return (
      <p className="mt-3 text-sm text-amber-200">
        No withdrawable referral balance yet. Earnings unlock after referred bookings pay and you
        complete move-out.
      </p>
    );
  }

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const amountPaise = Math.round(Number.parseFloat(amountInr || '0') * 100);
      const res = await fetch('/api/resident/referrals/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upiId, amountPaise }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not submit withdrawal request.');
        return;
      }
      setSuccess(true);
      onSubmitted?.();
    } finally {
      setPending(false);
    }
  };

  if (success) {
    return (
      <p className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">
        Withdrawal request submitted. Operations will review and pay to your UPI.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <h3 className="text-sm font-semibold text-white">Referral withdrawal</h3>
      <p className="text-xs text-apg-silver">
        Maximum withdrawable: {paiseToInr(availablePaise)}
      </p>
      <label className="block">
        <span className="text-xs font-medium text-apg-silver">Amount (₹)</span>
        <input
          type="number"
          min={1}
          max={Math.round(availablePaise / 100)}
          value={amountInr}
          onChange={(e) => setAmountInr(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-apg-silver">UPI ID</span>
        <input
          value={upiId}
          onChange={(e) => setUpiId(e.target.value)}
          placeholder="name@upi"
          className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
        />
      </label>
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      <button type="button" disabled={pending} onClick={() => void submit()} className={primaryBtn}>
        {pending ? 'Submitting…' : 'Submit withdrawal request'}
      </button>
    </div>
  );
}
