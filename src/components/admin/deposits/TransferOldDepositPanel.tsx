'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  loadTransferOldDepositSourcesAction,
  transferOldDepositAction,
  type DepositWalletActionState,
} from '@/app/(admin)/admin/deposits/deposit-wallet-actions';
import { paiseToInr } from '@/src/lib/format';

const idleState: DepositWalletActionState = { status: 'idle' };

export function TransferOldDepositPanel({ targetBookingId }: { targetBookingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<DepositWalletActionState>(idleState);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sources, setSources] = useState<
    Array<{ bookingId: string; bookingCode: string | null; availablePaise: number }>
  >([]);
  const [depositRequiredPaise, setDepositRequiredPaise] = useState(0);
  const [creditAppliedPaise, setCreditAppliedPaise] = useState(0);
  const [sourceBookingId, setSourceBookingId] = useState('');
  const [amountInr, setAmountInr] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    let cancelled = false;
    void loadTransferOldDepositSourcesAction(targetBookingId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setSources(result.sources);
      setDepositRequiredPaise(result.depositRequiredPaise);
      setCreditAppliedPaise(result.creditAlreadyAppliedPaise);
      if (result.sources[0]) {
        setSourceBookingId(result.sources[0].bookingId);
        const remaining = Math.max(
          0,
          result.depositRequiredPaise - result.creditAlreadyAppliedPaise,
        );
        const cap = Math.min(remaining, result.sources[0].availablePaise);
        setAmountInr(cap > 0 ? String(cap / 100) : '');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [targetBookingId]);

  const remainingDuePaise = Math.max(0, depositRequiredPaise - creditAppliedPaise);
  const selectedSource = sources.find((s) => s.bookingId === sourceBookingId);

  function onSourceChange(nextId: string) {
    setSourceBookingId(nextId);
    const source = sources.find((s) => s.bookingId === nextId);
    if (!source) return;
    const cap = Math.min(remainingDuePaise, source.availablePaise);
    setAmountInr(cap > 0 ? String(cap / 100) : '');
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set('targetBookingId', targetBookingId);
    startTransition(async () => {
      const next = await transferOldDepositAction(state, formData);
      setState(next);
      if (next.status === 'ok') {
        router.refresh();
      }
    });
  }

  if (loading) {
    return (
      <p className="text-sm text-apg-silver">Loading prior booking deposits…</p>
    );
  }

  if (loadError) {
    return <p className="text-sm text-rose-300">{loadError}</p>;
  }

  if (sources.length === 0) {
    return (
      <p className="text-sm text-apg-silver">
        No refundable deposit on prior bookings for this resident. New bookings always require the
        full deposit unless you transfer credit here.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-apg-silver">
        Move refundable deposit from a completed stay onto this booking. This reduces cash/UPI due
        on the target booking only — never applied automatically at customer checkout.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-apg-silver">
          Source booking
          <select
            name="sourceBookingId"
            value={sourceBookingId}
            onChange={(e) => onSourceChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#121820] px-3 py-2 text-sm text-white"
            required
          >
            {sources.map((s) => (
              <option key={s.bookingId} value={s.bookingId}>
                {s.bookingCode ?? s.bookingId.slice(0, 8)} · {paiseToInr(s.availablePaise)}{' '}
                refundable
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-apg-silver">
          Transfer amount (₹)
          <input
            name="amountInr"
            value={amountInr}
            onChange={(e) => setAmountInr(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#121820] px-3 py-2 text-sm text-white"
            inputMode="decimal"
            required
          />
          {selectedSource ? (
            <span className="mt-1 block text-xs text-apg-silver">
              Max {paiseToInr(Math.min(remainingDuePaise, selectedSource.availablePaise))} for this
              booking
            </span>
          ) : null}
        </label>
      </div>

      <label className="block text-sm text-apg-silver">
        Reason (audit log)
        <textarea
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-white/10 bg-[#121820] px-3 py-2 text-sm text-white"
          placeholder="Why is this deposit being transferred?"
          required
        />
      </label>

      <dl className="grid gap-2 rounded-lg border border-white/10 bg-[#121820] p-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-apg-silver">Deposit required</dt>
          <dd className="font-semibold text-white">{paiseToInr(depositRequiredPaise)}</dd>
        </div>
        <div>
          <dt className="text-xs text-apg-silver">Already transferred</dt>
          <dd className="font-semibold text-white">{paiseToInr(creditAppliedPaise)}</dd>
        </div>
        <div>
          <dt className="text-xs text-apg-silver">Still due after transfer</dt>
          <dd className="font-semibold text-white">{paiseToInr(remainingDuePaise)}</dd>
        </div>
      </dl>

      {state.status === 'error' ? (
        <p className="text-sm text-rose-300">{state.message}</p>
      ) : null}
      {state.status === 'ok' ? (
        <p className="text-sm text-emerald-300">{state.message}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending || remainingDuePaise <= 0}
        className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e6511a] disabled:opacity-50"
      >
        {pending ? 'Transferring…' : 'Transfer old deposit'}
      </button>
    </form>
  );
}
