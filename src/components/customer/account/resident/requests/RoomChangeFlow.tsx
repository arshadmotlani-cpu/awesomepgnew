'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ApgCard } from '@/src/components/customer/design-system';
import { paiseToInr } from '@/src/lib/format';
import { primaryBtn, secondaryBtn } from '@/src/lib/design-system/tokens';
import type { RoomShiftQuoteSnapshot } from '@/src/services/roomShiftQuote';
import type { RoomChangeBedOption } from '@/app/(customer)/account/resident/room-change-actions';
import {
  fetchRoomChangeAvailabilityAction,
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
  const [beds, setBeds] = useState<RoomChangeBedOption[]>([]);
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  const [quote, setQuote] = useState<RoomShiftQuoteSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedBed = beds.find((b) => b.bedId === selectedBedId) ?? null;

  function loadBeds() {
    startTransition(async () => {
      setError(null);
      const res = await fetchRoomChangeAvailabilityAction({ pgId, fromBedId });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setBeds(res.beds);
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
      });
      if (!res.ok) {
        setError(res.message);
        setQuote(null);
        return;
      }
      setQuote(res.quote);
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
        quoteSnapshot: quote,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="space-y-4 pb-2">
      <ApgCard tier="resident">
        <h2 className="text-lg font-semibold text-white">Room transfer</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Current: {roomLabel} · {paiseToInr(monthlyRentPaise)}/mo
        </p>
        <p className="mt-2 text-xs text-apg-silver">
          Each bed shows whether your move is <strong className="text-white">Immediate</strong> (vacant
          now) or <strong className="text-white">Scheduled</strong> (after the current occupant checks
          out).
        </p>
        {beds.length === 0 ? (
          <button type="button" onClick={loadBeds} disabled={pending} className={`${primaryBtn} mt-4`}>
            {pending ? 'Loading…' : 'Browse transfer options'}
          </button>
        ) : (
          <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto">
            {beds.map((bed) => (
              <li key={bed.bedId}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBedId(bed.bedId);
                    setQuote(null);
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
                      : `Checkout ${bed.scenario.occupantCheckoutDate} · Transfer ${bed.scenario.expectedTransferDate}`}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
        {selectedBed && !quote ? (
          selectedBed.scenario.mode === 'waitlist' ? (
            <button type="button" onClick={joinWaitlist} disabled={pending} className={`${primaryBtn} mt-4 w-full`}>
              Join waitlist
            </button>
          ) : (
            <button type="button" onClick={loadQuote} disabled={pending} className={`${primaryBtn} mt-4 w-full`}>
              Preview billing ({selectedBed.scenario.label})
            </button>
          )
        ) : null}
      </ApgCard>

      {quote ? (
        <ApgCard tier="resident">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Transfer summary</h3>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${scenarioBadgeClass(quote.transferMode)}`}
            >
              {quote.transferLabel} transfer
            </span>
          </div>
          {quote.transferMode === 'scheduled' && quote.occupantCheckoutDate ? (
            <dl className="mt-3 space-y-1 text-xs text-apg-silver">
              <div className="flex justify-between">
                <dt>Current occupant checkout</dt>
                <dd className="text-white">{quote.occupantCheckoutDate}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Expected transfer date</dt>
                <dd className="text-white">{quote.expectedTransferDate}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-xs text-apg-silver">
              Move type: <span className="text-white">Immediate</span> — after admin approval and
              required payments you can move right away.
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {quote.lines.map((line) => (
              <li key={line.label} className="flex justify-between text-sm">
                <span className="text-apg-silver">{line.label}</span>
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
            Submit {quote.transferLabel.toLowerCase()} transfer request
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
