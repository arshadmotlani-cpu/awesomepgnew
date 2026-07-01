'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ApgCard } from '@/src/components/customer/design-system';
import { paiseToInr } from '@/src/lib/format';
import { primaryBtn, secondaryBtn } from '@/src/lib/design-system/tokens';
import type { RoomShiftQuoteSnapshot } from '@/src/services/roomShiftQuote';
import {
  fetchRoomChangeAvailabilityAction,
  quoteRoomChangeAction,
  submitRoomChangeAction,
} from '@/app/(customer)/account/resident/room-change-actions';

type BedOption = {
  bedId: string;
  roomNumber: string;
  bedCode: string;
  monthlyRentPaise: number;
};

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
  const [beds, setBeds] = useState<BedOption[]>([]);
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  const [shiftDate, setShiftDate] = useState('');
  const [quote, setQuote] = useState<RoomShiftQuoteSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  function loadQuote() {
    if (!selectedBedId) return;
    startTransition(async () => {
      setError(null);
      const res = await quoteRoomChangeAction({
        bookingId,
        toBedId: selectedBedId,
        shiftDate: shiftDate || undefined,
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
    if (!selectedBedId || !quote) return;
    startTransition(async () => {
      setError(null);
      const res = await submitRoomChangeAction({
        bookingId,
        toBedId: selectedBedId,
        shiftDate: quote.shiftDate,
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
        <h2 className="text-lg font-semibold text-white">Room change</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Current: {roomLabel} · {paiseToInr(monthlyRentPaise)}/mo
        </p>
        {beds.length === 0 ? (
          <button type="button" onClick={loadBeds} disabled={pending} className={`${primaryBtn} mt-4`}>
            {pending ? 'Loading…' : 'Browse available beds'}
          </button>
        ) : (
          <ul className="mt-4 max-h-48 space-y-2 overflow-y-auto">
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
                  Room {bed.roomNumber} · Bed {bed.bedCode} — {paiseToInr(bed.monthlyRentPaise)}/mo
                </button>
              </li>
            ))}
          </ul>
        )}
        {selectedBedId ? (
          <label className="mt-4 block text-xs text-apg-silver">
            Preferred shift date
            <input
              type="date"
              value={shiftDate}
              onChange={(e) => {
                setShiftDate(e.target.value);
                setQuote(null);
              }}
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
            />
          </label>
        ) : null}
        {selectedBedId && !quote ? (
          <button type="button" onClick={loadQuote} disabled={pending} className={`${primaryBtn} mt-4 w-full`}>
            Get quote
          </button>
        ) : null}
      </ApgCard>

      {quote ? (
        <ApgCard tier="resident">
          <h3 className="text-sm font-semibold text-white">Room shift quote</h3>
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
            Confirm request
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
