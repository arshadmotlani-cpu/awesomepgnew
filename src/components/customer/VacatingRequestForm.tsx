'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import {
  submitVacatingAction,
  type VacatingActionState,
} from '@/app/(customer)/account/resident/actions';
import { previewMoveOutSettlementAction } from '@/app/(customer)/account/resident/move-out-preview-actions';
import {
  ACCOUNT_SURFACE,
  ACCOUNT_SURFACE_PRIMARY_BTN,
} from '@/src/components/customer/accountStyles';
import { ApgCard } from '@/src/components/customer/design-system';
import { MoveOutDatePicker } from '@/src/components/customer/account/resident/vacating/MoveOutDatePicker';
import { ResidentMoveOutRequestPreviewPanel } from '@/src/components/customer/account/resident/vacating/ResidentMoveOutRequestPreviewPanel';
import { defaultVacatingDate } from '@/src/lib/dateDefaults';
import { isOpenEndedStayEnd, todayString } from '@/src/lib/dates';
import type { ResidentMoveOutRequestPreview } from '@/src/lib/vacating/residentMoveOutRequestPreview';
import { primaryBtn } from '@/src/lib/design-system/tokens';

const idleState: VacatingActionState = { status: 'idle' };

export function VacatingRequestForm({
  bookingId,
  depositHeldPaise: _depositHeldPaise,
  monthlyRentPaise,
  expectedCheckoutDate,
  variant = 'standalone',
  onBack,
}: {
  bookingId: string;
  depositHeldPaise: number;
  monthlyRentPaise: number;
  expectedCheckoutDate?: string | null;
  variant?: 'standalone' | 'resident';
  onBack?: () => void;
}) {
  const resident = variant === 'resident';
  const initialDate =
    expectedCheckoutDate && !isOpenEndedStayEnd(expectedCheckoutDate)
      ? expectedCheckoutDate >= todayString()
        ? expectedCheckoutDate
        : todayString()
      : defaultVacatingDate();
  const [state, action, pending] = useActionState(submitVacatingAction, idleState);
  const [vacatingDate, setVacatingDate] = useState(initialDate);
  const [preview, setPreview] = useState<ResidentMoveOutRequestPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vacatingDate)) return;

    const requestId = ++requestIdRef.current;
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      setPreviewError(null);
      void previewMoveOutSettlementAction({
        bookingId,
        vacatingDate,
        monthlyRentPaise,
      }).then((result) => {
        if (requestId !== requestIdRef.current) return;
        setPreviewLoading(false);
        if (!result.ok) {
          setPreview(null);
          setPreviewError(result.error);
          return;
        }
        setPreview(result.preview);
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [bookingId, vacatingDate, monthlyRentPaise]);

  const shellClass = resident
    ? 'space-y-4'
    : `${ACCOUNT_SURFACE} space-y-4 p-5`;

  const fieldClass = resident
    ? 'mt-1 block w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-apg-orange focus:outline-none focus:ring-1 focus:ring-apg-orange'
    : 'apg-admin-field mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-[#FF5A1F] focus:outline-none focus:ring-1 focus:ring-[#FF5A1F]';

  const labelClass = resident
    ? 'text-xs font-medium uppercase tracking-wide text-apg-silver'
    : 'text-xs font-medium uppercase tracking-wide text-zinc-600';

  const content = (
    <form action={action} data-roachie-focus="vacating" className={shellClass}>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-medium text-apg-orange hover:underline"
        >
          ← Back to requests
        </button>
      ) : null}

      {resident ? (
        <ApgCard tier="resident" className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-apg-orange">Move-out</p>
          <h2 className="text-lg font-semibold text-white">Select your move-out date</h2>
          <p className="text-sm text-apg-silver">
            Choose your final stay date. Settlement updates as you pick a date.
          </p>
        </ApgCard>
      ) : null}

      <input type="hidden" name="bookingId" value={bookingId} />

      {resident ? (
        <MoveOutDatePicker
          value={vacatingDate}
          onChange={setVacatingDate}
          theme="dark"
          minDate={todayString()}
        />
      ) : (
        <label className="block">
          <span className={labelClass}>Move-out date</span>
          <input
            type="date"
            name="vacatingDate"
            required
            min={todayString()}
            value={vacatingDate}
            onChange={(e) => setVacatingDate(e.target.value)}
            className={fieldClass}
          />
        </label>
      )}

      {preview ? (
        <ResidentMoveOutRequestPreviewPanel preview={preview} loading={previewLoading} />
      ) : previewLoading ? (
        <p className={`text-xs ${resident ? 'text-apg-silver' : 'text-zinc-500'}`}>
          Calculating settlement estimate…
        </p>
      ) : null}

      {previewError ? (
        <p className="rounded-lg bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{previewError}</p>
      ) : null}

      <div
        className={
          resident
            ? 'rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-apg-silver'
            : `${ACCOUNT_SURFACE} p-4 text-sm text-zinc-700`
        }
      >
        <p className={resident ? 'font-medium text-white' : 'font-medium text-zinc-900'}>
          Important information
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed">
          <li>Your selected date is your final stay date.</li>
          <li>Your bed becomes available the next day at 12:00 AM.</li>
          <li>Rent is adjusted according to your final stay date and payment status.</li>
          <li>Electricity due up to your move-out date is included in final settlement.</li>
        </ul>
      </div>

      <label className="block">
        <span className={labelClass}>Notes (optional)</span>
        <textarea
          name="notes"
          rows={2}
          className={fieldClass}
          placeholder="Anything the office should know about your move-out"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className={resident ? `w-full ${primaryBtn}` : `w-full ${ACCOUNT_SURFACE_PRIMARY_BTN}`}
      >
        {pending ? 'Submitting…' : 'Submit move-out request'}
      </button>

      {state.status === 'error' ? (
        <p
          className={
            resident
              ? 'rounded-lg bg-rose-950/40 px-3 py-2 text-sm text-rose-200'
              : 'rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700'
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );

  return content;
}
