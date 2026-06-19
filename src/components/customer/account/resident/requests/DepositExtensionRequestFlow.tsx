'use client';

import { useState } from 'react';
import { ConfirmationGate } from '@/src/components/customer/design-system';
import { submitDepositDueExtensionRequestAction } from '@/app/(customer)/account/resident/deposit-actions';
import { RequestSuccessState } from '@/src/components/customer/account/resident/requests/RequestSuccessState';
import { residentTabHref } from '@/src/lib/accountNavigation';

export function DepositExtensionRequestFlow({
  bookingId,
  onDone,
  onBack,
}: {
  bookingId: string;
  onDone: () => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState<'form' | 'confirm' | 'success'>('form');
  const [requestedDate, setRequestedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (step === 'success') {
    return (
      <RequestSuccessState
        title="Extension request submitted"
        statusLabel="Submitted"
        nextStep="Admin will review your new due date. Check Active requests for updates."
        primaryHref={residentTabHref('requests')}
        primaryLabel="Back to requests"
      />
    );
  }

  if (step === 'confirm') {
    return (
      <ConfirmationGate
        title="Submit extension request?"
        message={
          <>
            You are asking for more time to pay your security deposit. New date requested:{' '}
            <strong>{requestedDate}</strong>.
          </>
        }
        confirmLabel="Submit request"
        cancelLabel="Go back"
        pending={pending}
        onConfirm={() => {
          void (async () => {
            setPending(true);
            setError(null);
            const fd = new FormData();
            fd.set('bookingId', bookingId);
            fd.set('requestedDueDate', requestedDate);
            if (notes.trim()) fd.set('notes', notes.trim());
            const result = await submitDepositDueExtensionRequestAction(fd);
            setPending(false);
            if (result.ok) setStep('success');
            else setError(result.error ?? 'Could not submit.');
          })();
        }}
        onCancel={() => setStep('form')}
      />
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
      <button type="button" onClick={onBack} className="text-xs text-zinc-500 hover:text-zinc-800">
        ← Back
      </button>
      <h3 className="text-base font-semibold text-zinc-900">More time for deposit</h3>
      <p className="text-sm text-zinc-600">Pick a new date you can pay by. Admin must approve it.</p>
      <label className="block text-sm">
        <span className="font-medium text-zinc-800">New due date</span>
        <input
          type="date"
          value={requestedDate}
          onChange={(e) => setRequestedDate(e.target.value)}
          className="mt-1.5 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-zinc-800">Short note (optional)</span>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Why you need more time"
          className="mt-1.5 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <button
        type="button"
        disabled={!requestedDate}
        onClick={() => setStep('confirm')}
        className="flex w-full min-h-[48px] items-center justify-center rounded-xl bg-[#FF5A1F] text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40"
      >
        Continue
      </button>
    </div>
  );
}
