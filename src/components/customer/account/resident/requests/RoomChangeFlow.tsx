'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ApgCard } from '@/src/components/customer/design-system';
import { paiseToInr } from '@/src/lib/format';
import { primaryBtn, secondaryBtn } from '@/src/lib/design-system/tokens';
import type { RoomShiftQuoteSnapshot } from '@/src/services/roomShiftQuote';
import type {
  RoomChangeBedOption,
  RoomChangeDestinationPg,
  RoomChangeSubmitResult,
} from '@/app/(customer)/account/resident/room-change-actions';
import {
  cancelRoomChangeAction,
  fetchRoomChangeAvailabilityAction,
  fetchRoomChangeDestinationPgsAction,
  joinBedWaitlistAction,
  quoteRoomChangeAction,
  submitRoomChangeAction,
} from '@/app/(customer)/account/resident/room-change-actions';

type Props = {
  bookingId: string;
  pgId: string;
  fromBedId: string;
  roomLabel: string;
  monthlyRentPaise: number;
  depositHeldPaise: number;
  moveInDate: string;
  onClose: () => void;
};

type Step = 'pg' | 'beds' | 'review' | 'payment' | 'done';

function scenarioBadgeClass(mode: 'immediate' | 'scheduled' | 'waitlist'): string {
  if (mode === 'immediate') {
    return 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200';
  }
  if (mode === 'scheduled') {
    return 'border-amber-400/40 bg-amber-500/10 text-amber-200';
  }
  return 'border-sky-400/40 bg-sky-500/10 text-sky-200';
}

export function RoomChangeFlow({
  bookingId,
  pgId,
  fromBedId,
  roomLabel,
  monthlyRentPaise,
  depositHeldPaise,
  moveInDate,
  onClose,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('pg');
  const [destinationPgs, setDestinationPgs] = useState<RoomChangeDestinationPg[]>([]);
  const [selectedPgId, setSelectedPgId] = useState<string | null>(null);
  const [beds, setBeds] = useState<RoomChangeBedOption[]>([]);
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  const [quote, setQuote] = useState<RoomShiftQuoteSnapshot | null>(null);
  const [submitResult, setSubmitResult] = useState<RoomChangeSubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [nowMs, setNowMs] = useState(() => Date.now());

  const selectedPg = destinationPgs.find((p) => p.id === selectedPgId) ?? null;
  const selectedBed = beds.find((b) => b.bedId === selectedBedId) ?? null;

  useEffect(() => {
    startTransition(async () => {
      setError(null);
      const res = await fetchRoomChangeDestinationPgsAction({ currentPgId: pgId });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setDestinationPgs(res.data?.pgs ?? []);
      const current = res.data?.pgs.find((p) => p.isCurrentPg);
      if (current) setSelectedPgId(current.id);
    });
  }, [pgId]);

  useEffect(() => {
    if (!submitResult?.expiresAt) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [submitResult?.expiresAt]);

  const remainingMs = submitResult?.expiresAt
    ? Math.max(0, new Date(submitResult.expiresAt).getTime() - nowMs)
    : 0;
  const remainingHours = Math.floor(remainingMs / 3_600_000);
  const remainingMinutes = Math.floor((remainingMs % 3_600_000) / 60_000);
  const remainingSeconds = Math.floor((remainingMs % 60_000) / 1_000);

  function loadBeds(pg: string) {
    startTransition(async () => {
      setError(null);
      setBeds([]);
      setSelectedBedId(null);
      setQuote(null);
      const res = await fetchRoomChangeAvailabilityAction({ pgId: pg, fromBedId });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setBeds(res.beds);
      setStep('beds');
    });
  }

  function joinWaitlist() {
    if (!selectedBed || selectedBed.scenario.mode !== 'waitlist') return;
    startTransition(async () => {
      setError(null);
      const res = await joinBedWaitlistAction({
        bedId: selectedBed.bedId,
        bookingId,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function loadQuote() {
    if (!selectedBed) return;
    startTransition(async () => {
      setError(null);
      const res = await quoteRoomChangeAction({
        bookingId,
        toBedId: selectedBed.bedId,
        shiftDate: selectedBed.scenario.expectedTransferDate,
        moveInDate,
        fromRoomLabel: roomLabel,
      });
      if (!res.ok) {
        setError(res.message);
        setQuote(null);
        return;
      }
      setQuote(res.quote);
      setStep('review');
    });
  }

  function submit() {
    if (!selectedBed || !quote) return;
    startTransition(async () => {
      setError(null);
      const res = await submitRoomChangeAction({
        bookingId,
        toBedId: selectedBed.bedId,
        shiftDate: quote.expectedTransferDate,
        moveInDate,
        fromRoomLabel: roomLabel,
        quoteSnapshot: quote,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setSubmitResult(res.data);
      setStep('done');
      router.refresh();
    });
  }

  function cancelSubmittedRequest() {
    if (!submitResult) return;
    startTransition(async () => {
      setError(null);
      const result = await cancelRoomChangeAction({ requestId: submitResult.requestId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  if (step === 'done') {
    return (
      <div className="space-y-4 pb-2">
        <ApgCard tier="resident">
          <h2 className="text-lg font-semibold text-white">Change Bed confirmed</h2>
          <p className="mt-2 text-sm text-apg-silver">
            {submitResult?.status === 'completed'
              ? 'Your bed transfer is complete. Any remaining Change Bed charges stay on Payments.'
              : 'Your Change Bed request is scheduled. We will move you on the transfer date. Any charges stay on Payments.'}
          </p>
          <button type="button" onClick={onClose} className={`${primaryBtn} mt-4 w-full`}>
            Done
          </button>
        </ApgCard>
      </div>
    );
  }

  if (step === 'payment' && submitResult) {
    return (
      <div className="space-y-4 pb-2">
        <ApgCard tier="resident">
          <h2 className="text-lg font-semibold text-white">Complete payment</h2>
          <p className="mt-1 text-sm text-apg-silver">
            Pay remaining charges on Payments. Payment does not authorize the transfer — your bed is already secured.
          </p>
          <p className="mt-2 text-sm font-medium text-amber-200" aria-live="polite">
            Target bed reserved for {remainingHours}h {remainingMinutes}m {remainingSeconds}s
          </p>
          <p className="mt-3 text-lg font-bold text-apg-orange">
            Total due: {paiseToInr(submitResult.totalDuePaise)}
          </p>
          {submitResult.payAllHref ? (
            <Link href={submitResult.payAllHref} className={`${primaryBtn} mt-4 block w-full text-center`}>
              Pay all charges
            </Link>
          ) : null}
          {submitResult.individual.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {submitResult.individual.map((item) => (
                <li key={item.invoiceId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-apg-silver">{item.label}</span>
                  {item.href ? (
                    <Link href={item.href} className="text-apg-orange hover:underline">
                      {paiseToInr(item.amountPaise)} →
                    </Link>
                  ) : (
                    <span className="text-white">{paiseToInr(item.amountPaise)}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </ApgCard>
        <button
          type="button"
          onClick={cancelSubmittedRequest}
          disabled={pending}
          className={`${secondaryBtn} w-full`}
        >
          Cancel Change Bed
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-2">
      <ApgCard tier="resident">
        <h2 className="text-lg font-semibold text-white">Change Bed</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Current: {roomLabel} · {paiseToInr(monthlyRentPaise)}/mo · Deposit held{' '}
          {paiseToInr(depositHeldPaise)}
        </p>

        {step === 'pg' ? (
          <>
            <p className="mt-3 text-xs text-apg-silver">
              Choose which property you want to move to. You can transfer within your current PG or
              to another Awesome PG.
            </p>
            {destinationPgs.length === 0 ? (
              <p className="mt-4 text-sm text-apg-silver">Loading properties…</p>
            ) : (
              <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto">
                {destinationPgs.map((pg) => (
                  <li key={pg.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedPgId(pg.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                        selectedPgId === pg.id
                          ? 'border-apg-orange/50 bg-apg-orange/10 text-white'
                          : 'border-white/10 text-apg-silver hover:border-white/20'
                      }`}
                    >
                      <span className="font-medium">{pg.name}</span>
                      {pg.isCurrentPg ? (
                        <span className="ml-2 text-[10px] uppercase text-emerald-300">Current PG</span>
                      ) : null}
                      {pg.city ? (
                        <span className="mt-0.5 block text-xs text-apg-silver">{pg.city}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selectedPgId ? (
              <button
                type="button"
                onClick={() => loadBeds(selectedPgId)}
                disabled={pending}
                className={`${primaryBtn} mt-4 w-full`}
              >
                {pending ? 'Loading beds…' : `Browse beds at ${selectedPg?.name ?? 'property'}`}
              </button>
            ) : null}
          </>
        ) : null}

        {step === 'beds' || step === 'review' ? (
          <>
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-xs text-apg-silver">
                {selectedPg?.name ?? 'Selected property'} — beds show{' '}
                <strong className="text-white">Immediate</strong>,{' '}
                <strong className="text-white">Scheduled</strong>, or{' '}
                <strong className="text-white">Waitlist</strong>.
              </p>
              <button
                type="button"
                onClick={() => {
                  setStep('pg');
                  setBeds([]);
                  setSelectedBedId(null);
                  setQuote(null);
                }}
                className="shrink-0 text-xs text-apg-orange hover:underline"
              >
                Change PG
              </button>
            </div>
            {beds.length === 0 ? (
              <p className="mt-4 text-sm text-apg-silver">No transfer options available right now.</p>
            ) : (
              <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto">
                {beds.map((bed) => (
                  <li key={bed.bedId}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBedId(bed.bedId);
                        setQuote(null);
                        if (step === 'review') setStep('beds');
                      }}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                        selectedBedId === bed.bedId
                          ? 'border-apg-orange/50 bg-apg-orange/10 text-white'
                          : 'border-white/10 text-apg-silver hover:border-white/20'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          Room {bed.roomNumber} · Bed {bed.bedCode} — {paiseToInr(bed.monthlyRentPaise)}/mo
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${scenarioBadgeClass(bed.scenario.mode)}`}
                        >
                          {bed.scenario.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-apg-silver">
                        {bed.scenario.mode === 'immediate'
                          ? `Earliest move: ${bed.scenario.expectedTransferDate} (today)`
                          : bed.scenario.mode === 'scheduled'
                            ? `Checkout ${bed.scenario.occupantCheckoutDate} · Transfer ${bed.scenario.expectedTransferDate}`
                            : 'Join waitlist — we will notify you when this bed opens'}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selectedBed && step === 'beds' && !quote ? (
              selectedBed.scenario.mode === 'waitlist' ? (
                <button
                  type="button"
                  onClick={joinWaitlist}
                  disabled={pending}
                  className={`${primaryBtn} mt-4 w-full`}
                >
                  Join waitlist
                </button>
              ) : (
                <button
                  type="button"
                  onClick={loadQuote}
                  disabled={pending}
                  className={`${primaryBtn} mt-4 w-full`}
                >
                  {pending ? 'Calculating…' : `Review billing (${selectedBed.scenario.label})`}
                </button>
              )
            ) : null}
          </>
        ) : null}
      </ApgCard>

      {quote && step === 'review' ? (
        <ApgCard tier="resident">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Transfer summary</h3>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${scenarioBadgeClass(quote.transferMode)}`}
            >
              {quote.transferLabel} transfer
            </span>
          </div>
          {quote.toPgName ? (
            <p className="mt-2 text-xs text-apg-silver">
              Destination:{' '}
              <span className="text-white">
                {quote.toPgName}
                {quote.toRoomNumber && quote.toBedCode
                  ? ` · Room ${quote.toRoomNumber} · Bed ${quote.toBedCode}`
                  : ''}
              </span>
            </p>
          ) : null}
          {quote.transferMode === 'scheduled' && quote.occupantCheckoutDate ? (
            <dl className="mt-3 space-y-1 text-xs text-apg-silver">
              <div className="flex justify-between">
                <dt>Current occupant checkout</dt>
                <dd className="text-white">{quote.occupantCheckoutDate}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Your transfer date</dt>
                <dd className="text-white">{quote.expectedTransferDate}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-xs text-apg-silver">
              Move type: <span className="text-white">Immediate</span> — confirming secures the new
              bed and completes the transfer. Remaining charges stay payable on Payments.
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {quote.lines.map((line) => (
              <li key={line.label} className="flex justify-between text-sm">
                <span className="text-apg-silver">
                  {line.label}
                  {line.label === 'New bed remaining rent' &&
                  quote.newRentChargePaise > quote.newRentDuePaise ? (
                    <span className="block text-xs text-apg-silver/80">
                      Net due after credit: {paiseToInr(quote.newRentDuePaise)}
                    </span>
                  ) : null}
                </span>
                <span className={line.kind === 'credit' ? 'text-emerald-300' : 'text-white'}>
                  {line.kind === 'credit' ? '−' : ''}
                  {paiseToInr(line.amountPaise)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-lg font-bold text-apg-orange">
            Total due: {paiseToInr(quote.totalDuePaise)}
          </p>
          <button type="button" onClick={submit} disabled={pending} className={`${primaryBtn} mt-4 w-full`}>
            {pending ? 'Confirming…' : 'Confirm Change Bed'}
          </button>
          <button
            type="button"
            onClick={() => {
              setQuote(null);
              setStep('beds');
            }}
            className="mt-2 w-full text-center text-xs text-apg-silver hover:text-white"
          >
            Back to bed list
          </button>
        </ApgCard>
      ) : null}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      <button type="button" onClick={onClose} className={`${secondaryBtn} w-full`}>
        Cancel
      </button>
    </div>
  );
}
