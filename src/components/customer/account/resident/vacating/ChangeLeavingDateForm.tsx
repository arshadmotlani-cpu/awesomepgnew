'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ApgCard } from '@/src/components/customer/design-system';
import { formatDate } from '@/src/lib/format';
import { todayString } from '@/src/lib/dates';
import {
  previewVacatingDateChangeAction,
  submitVacatingDateChangeAction,
  cancelVacatingDateChangeRequestAction,
} from '@/app/(customer)/account/resident/vacating-date-change-actions';
import type { VacatingDateChangePreview } from '@/src/services/vacatingDateChange';
import { buildVacatingDateConfirmation } from '@/src/lib/vacating/vacatingBedSemantics';
import { ResidentVacatingDateChangeImpact } from '@/src/components/customer/account/resident/vacating/ResidentVacatingDateChangeImpact';

function buildDateExplanation(vacatingDate: string): string {
  const conf = buildVacatingDateConfirmation(vacatingDate);
  if (conf.isTodaySelected) {
    return 'If you select today, today will be your final paid/stay day. Your bed will be available tomorrow at 11:00 AM.';
  }
  return `If you select ${conf.finalStayDateLabel}, ${conf.finalStayDateLabel} will be your final paid/stay day. Your bed will be available from ${conf.bedAvailableLabel}.`;
}

export function ChangeLeavingDateForm({
  bookingId,
  currentVacatingDate,
  pendingRequestId,
  pendingPreview,
  originalNoticeGivenDate,
  onSubmitted,
}: {
  bookingId: string;
  currentVacatingDate: string;
  pendingRequestId?: string | null;
  pendingPreview?: VacatingDateChangePreview | null;
  originalNoticeGivenDate?: string | null;
  onSubmitted?: () => void;
}) {
  const [newDate, setNewDate] = useState('');
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<VacatingDateChangePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const previewRequestIdRef = useRef(0);
  const today = todayString();
  const dateExplanation = /^\d{4}-\d{2}-\d{2}$/.test(newDate) ? buildDateExplanation(newDate) : null;
  const canSubmit = Boolean(preview) && !error && !pending;

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || newDate === currentVacatingDate) {
      setPreview(null);
      return;
    }

    const requestId = ++previewRequestIdRef.current;
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        setError(null);
        const res = await previewVacatingDateChangeAction(bookingId, newDate);
        if (requestId !== previewRequestIdRef.current) return;
        if (!res.ok || !res.preview) {
          setError(res.ok ? 'Could not calculate impact.' : res.error);
          setPreview(null);
          return;
        }
        setPreview(res.preview);
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [bookingId, currentVacatingDate, newDate]);

  if (pendingRequestId) {
    const impact = pendingPreview;
    return (
      <ApgCard tier="resident" className="border-amber-500/30 bg-amber-950/20 space-y-4">
        <div>
          <p className="text-sm font-semibold text-amber-200">Date change awaiting approval</p>
          <p className="mt-1 text-xs text-amber-100/80">Status: Awaiting admin approval</p>
        </div>

        {impact ? (
          <>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-amber-200/70">
                  Current approved stay
                </p>
                <p className="font-medium text-white">{formatDate(impact.currentVacatingDate)}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-amber-200/70">
                  Requested stay
                </p>
                <p className="font-medium text-white">{formatDate(impact.requestedVacatingDate)}</p>
              </div>
              {originalNoticeGivenDate || impact.noticeGivenDate ? (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-amber-200/70">
                    Original notice
                  </p>
                  <p className="font-medium text-white">
                    {formatDate(originalNoticeGivenDate ?? impact.noticeGivenDate ?? '')}
                  </p>
                </div>
              ) : null}
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-amber-200/70">
                  Notice compliance
                </p>
                <p className="font-medium text-white">
                  {impact.noticeCompliant
                    ? `✓ ${impact.noticeComplianceLabel ?? '5-day notice satisfied'}`
                    : impact.noticeComplianceLabel ?? '5-day notice not satisfied'}
                </p>
              </div>
            </div>
            <ResidentVacatingDateChangeImpact preview={impact} />
          </>
        ) : (
          <p className="text-sm text-amber-100/90">
            Your requested date change is with the office for review.
          </p>
        )}

        <button
          type="button"
          disabled={pending}
          className="text-xs font-medium text-amber-200 underline disabled:opacity-50"
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
        {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      </ApgCard>
    );
  }

  return (
    <ApgCard tier="resident" className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-white">Change final stay date</h2>
        <p className="mt-1 text-xs text-apg-silver">
          Current approved final stay date: {formatDate(currentVacatingDate)}
        </p>
      </div>

      <label className="block text-xs font-medium text-apg-silver">
        New final stay date
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
        Note (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </label>

      {pending && !preview ? (
        <p className="text-xs text-apg-silver">Calculating impact…</p>
      ) : null}

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}

      {preview ? <ResidentVacatingDateChangeImpact preview={preview} /> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canSubmit}
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
    </ApgCard>
  );
}
