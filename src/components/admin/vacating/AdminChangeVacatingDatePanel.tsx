'use client';

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdminConfirmSubmit } from '@/src/components/admin/AdminConfirmSubmit';
import { extendVacatingDateAction } from '@/app/(admin)/admin/vacating/actions';
import { previewAdminVacatingDateChangeAction } from '@/app/(admin)/admin/vacating/dateChangeActions';
import type { VacatingDateChangePreview } from '@/src/services/vacatingDateChange';
import type { VacatingActionState } from '@/src/lib/vacating/vacatingActionTypes';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';
import { buildVacatingDateConfirmation } from '@/src/lib/vacating/vacatingBedSemantics';

const idle: VacatingActionState = { status: 'idle' };

export function AdminChangeVacatingDatePanel({
  bookingId,
  currentVacatingDate,
  noticeGivenDate,
  vacatingStatus,
  theme = 'dark',
}: {
  bookingId: string;
  currentVacatingDate: string;
  noticeGivenDate: string;
  vacatingStatus: 'pending' | 'approved' | string;
  theme?: 'dark' | 'light';
}) {
  const router = useRouter();
  const [newDate, setNewDate] = useState('');
  const [preview, setPreview] = useState<VacatingDateChangePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPending, startPreview] = useTransition();
  const [state, formAction, savePending] = useActionState(extendVacatingDateAction, idle);
  const formId = `admin-change-vacating-${bookingId}`;

  useEffect(() => {
    if (state.status === 'ok') router.refresh();
  }, [state.status, router]);

  const dateConfirmation = useMemo(
    () =>
      /^\d{4}-\d{2}-\d{2}$/.test(newDate) ? buildVacatingDateConfirmation(newDate) : null,
    [newDate],
  );

  const shell =
    theme === 'dark'
      ? 'rounded-xl border border-sky-500/30 bg-sky-500/10 p-4'
      : 'rounded-xl border border-sky-200 bg-sky-50/90 p-4';
  const titleClass = theme === 'dark' ? 'text-sm font-semibold text-sky-100' : 'text-sm font-semibold text-sky-900';
  const bodyClass = theme === 'dark' ? 'text-xs text-sky-100/90' : 'text-xs text-sky-950';
  const labelClass = theme === 'dark' ? 'text-[11px] text-sky-100/80' : 'text-[11px] text-sky-900/80';
  const inputClass =
    theme === 'dark'
      ? 'mt-1 block rounded border border-white/20 bg-black/30 px-2 py-1.5 text-xs text-white'
      : 'mt-1 block rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900';

  return (
    <div className={shell}>
      <p className={titleClass}>Change vacating date</p>
      <p className={`mt-1 ${bodyClass}`}>
        Current final stay date: <span className="font-medium">{formatDate(currentVacatingDate)}</span>
        {' · '}
        Notice from {formatDate(noticeGivenDate)}
        {vacatingStatus === 'pending' ? ' · pending approval' : ' · approved'}
      </p>

      <form id={formId} action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="bookingId" value={bookingId} />
        <label className={labelClass}>
          New final stay date
          <input
            type="date"
            name="newVacatingDate"
            value={newDate}
            onChange={(e) => {
              setNewDate(e.target.value);
              setPreview(null);
              setPreviewError(null);
            }}
            required
            className={inputClass}
          />
        </label>
        <button
          type="button"
          disabled={previewPending || !newDate}
          onClick={() =>
            startPreview(async () => {
              setPreviewError(null);
              const res = await previewAdminVacatingDateChangeAction(bookingId, newDate);
              if (!res.ok || !res.preview) {
                setPreviewError(res.ok ? 'Could not preview.' : res.error);
                setPreview(null);
                return;
              }
              setPreview(res.preview);
            })
          }
          className={
            theme === 'dark'
              ? 'rounded-md border border-white/20 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-white/10 disabled:opacity-50'
              : 'rounded-md border border-zinc-300 px-3 py-1.5 text-[11px] font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50'
          }
        >
          {previewPending ? 'Previewing…' : 'Preview impact'}
        </button>
        <AdminConfirmSubmit
          formId={formId}
          title="Change vacating date?"
          description="Updates the canonical vacating date on this move-out request — bed availability, rent sync, and settlement preview all follow the new final stay date."
          confirmLabel="Save new date"
          pending={savePending}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {savePending ? 'Saving…' : 'Save new date'}
        </AdminConfirmSubmit>
      </form>

      {previewError ? <p className="mt-2 text-[11px] text-rose-400">{previewError}</p> : null}

      {dateConfirmation ? (
        <ul className={`mt-3 space-y-0.5 ${bodyClass}`}>
          {dateConfirmation.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {preview ? (
        <div className={`mt-3 space-y-1 border-t pt-3 ${theme === 'dark' ? 'border-white/10' : 'border-sky-200'}`}>
          <p className={bodyClass}>
            {formatDate(preview.currentVacatingDate)} → {formatDate(preview.requestedVacatingDate)}
          </p>
          <p className={bodyClass}>{preview.refundDeltaLabel}</p>
          <p className={bodyClass}>
            Refund estimate {paiseToInr(preview.currentEstimatedRefundPaise)} →{' '}
            {paiseToInr(preview.requestedEstimatedRefundPaise)}
          </p>
          {!preview.noticeCompliant ? (
            <p className="text-[11px] font-medium text-amber-300">
              Notice shortfall: new date is fewer than {VACATING_NOTICE_MIN_DAYS} days after notice
              ({formatDate(noticeGivenDate)}). Admin save will record notice as non-compliant and
              apply notice deductions — not bypassed silently.
            </p>
          ) : (
            <p className="text-[11px] text-emerald-300/90">Notice period satisfied for new date.</p>
          )}
        </div>
      ) : null}

      {state.status === 'ok' ? (
        <p className="mt-2 text-[11px] text-emerald-400">{state.message}</p>
      ) : state.status === 'error' ? (
        <p className="mt-2 text-[11px] text-rose-400">{state.message}</p>
      ) : null}
    </div>
  );
}
