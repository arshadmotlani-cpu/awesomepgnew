'use client';

import { useState, useTransition } from 'react';
import { ApgCard } from '@/src/components/customer/design-system';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { todayString } from '@/src/lib/dates';
import {
  previewVacatingDateChangeAction,
  submitVacatingDateChangeAction,
  cancelVacatingDateChangeRequestAction,
} from '@/app/(customer)/account/resident/vacating-date-change-actions';
import type { VacatingDateChangePreview } from '@/src/services/vacatingDateChange';
import { buildVacatingDateConfirmation } from '@/src/lib/vacating/vacatingBedSemantics';

function buildDateExplanation(vacatingDate: string): string {
  const conf = buildVacatingDateConfirmation(vacatingDate);
  if (conf.isTodaySelected) {
    return 'If you leave today, today is your final paid/stay day. Your bed will be available tomorrow at 11:00 AM.';
  }
  return `If you select ${conf.finalStayDateLabel}, that will be your final paid/stay day. Your bed will be available ${conf.bedAvailableLabel}.`;
}

export function ChangeLeavingDateForm({
  bookingId,
  currentVacatingDate,
  pendingRequestId,
  onSubmitted,
}: {
  bookingId: string;
  currentVacatingDate: string;
  pendingRequestId?: string | null;
  onSubmitted?: () => void;
}) {
  const [newDate, setNewDate] = useState('');
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<VacatingDateChangePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = todayString();
  const dateExplanation = /^\d{4}-\d{2}-\d{2}$/.test(newDate) ? buildDateExplanation(newDate) : null;

  if (pendingRequestId) {
    return (
      <ApgCard tier="resident" className="border-amber-500/30 bg-amber-950/20">
        <p className="text-sm font-semibold text-amber-200">Date change awaiting approval</p>
        <p className="mt-1 text-sm text-amber-100/90">
          The office is reviewing your new final stay date. You will see the updated estimate here
          after approval.
        </p>
        <button
          type="button"
          disabled={pending}
          className="mt-3 text-xs font-medium text-amber-200 underline disabled:opacity-50"
          onClick={() =>
            startTransition(async () => {
              const res = await cancelVacatingDateChangeRequestAction(pendingRequestId);
              if (!res.ok) setError(res.error ?? 'Could not cancel.');
              else onSubmitted?.();
            })
          }
        >
          Withdraw date change request
        </button>
        {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
      </ApgCard>
    );
  }

  return (
    <ApgCard tier="resident" className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-white">Want to leave on a different date?</h2>
        <p className="mt-1 text-xs text-apg-silver">
          Current approved final stay date: {formatDate(currentVacatingDate)}
        </p>
      </div>

      <label className="block text-xs font-medium text-apg-silver">
        Final stay date
        <input
          type="date"
          min={today}
          value={newDate}
          onChange={(e) => {
            setNewDate(e.target.value);
            setPreview(null);
            setError(null);
          }}
          className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white [color-scheme:dark]"
        />
      </label>

      {dateExplanation ? (
        <p className="text-xs text-apg-silver">{dateExplanation}</p>
      ) : null}

      <label className="block text-xs font-medium text-apg-silver">
        Note for admin (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !newDate}
          className="rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/5 disabled:opacity-50"
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await previewVacatingDateChangeAction(bookingId, newDate);
              if (!res.ok || !res.preview) {
                setError(res.ok ? 'Could not preview.' : res.error);
                setPreview(null);
                return;
              }
              setPreview(res.preview);
            })
          }
        >
          Preview impact
        </button>
        <button
          type="button"
          disabled={pending || !preview}
          className="rounded-lg bg-apg-orange px-4 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await submitVacatingDateChangeAction(bookingId, newDate, notes);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              onSubmitted?.();
            })
          }
        >
          Submit change request
        </button>
      </div>

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}

      {preview ? (
        <div className="space-y-2 border-t border-white/10 pt-4">
          <p className="text-sm font-medium text-white">
            {formatDate(preview.currentVacatingDate)} → {formatDate(preview.requestedVacatingDate)}
          </p>
          <p className="text-sm text-apg-silver">{preview.refundDeltaLabel}</p>
          <p className="text-xs text-apg-silver">
            Current estimate {paiseToInr(preview.currentEstimatedRefundPaise)} → New estimate{' '}
            {paiseToInr(preview.requestedEstimatedRefundPaise)}
          </p>
        </div>
      ) : null}
    </ApgCard>
  );
}
