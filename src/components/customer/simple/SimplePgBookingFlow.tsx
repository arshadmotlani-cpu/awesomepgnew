'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { BedBookingPanel } from '@/src/components/customer/BedBookingPanel';
import { SimpleStayRules } from '@/src/components/customer/simple/SimpleStayRules';
import {
  buildSimpleCategoryOptions,
  lowestDailyRatePaise,
  type SimpleCategoryOption,
  type SimpleRoomCategoryId,
} from '@/src/lib/booking/simpleRoomCategory';
import type { CustomerRoomCard } from '@/src/db/queries/customer';
import type { CustomerRoomBedMap } from '@/src/components/customer/CustomerBedMap';
import { paiseToInr } from '@/src/lib/format';

type Step = 'entry' | 'rooms' | 'dates';

type Props = {
  pgName: string;
  images: string[];
  rooms: CustomerRoomCard[];
  bedMapRooms: CustomerRoomBedMap[];
  fullyOccupied: boolean;
};

/** Super-simple PG booking — one question per screen. */
export function SimplePgBookingFlow({
  pgName,
  images,
  rooms,
  bedMapRooms,
  fullyOccupied,
}: Props) {
  const [step, setStep] = useState<Step>('entry');
  const [picked, setPicked] = useState<SimpleCategoryOption | null>(null);

  const categories = useMemo(
    () => buildSimpleCategoryOptions(rooms, bedMapRooms),
    [rooms, bedMapRooms],
  );
  const dailyFrom = lowestDailyRatePaise(rooms);
  const heroImage = images[0] ?? null;

  function chooseCategory(id: SimpleRoomCategoryId) {
    const option = categories.find((c) => c.id === id);
    if (!option?.bed) return;
    setPicked(option);
    setStep('dates');
  }

  if (step === 'dates' && picked?.bed) {
    return (
      <div className="mx-auto max-w-lg">
        <button
          type="button"
          onClick={() => setStep('rooms')}
          className="mb-4 text-sm text-apg-silver hover:text-white"
        >
          ← Back
        </button>
        <h2 className="text-2xl font-bold text-white">When do you want to stay?</h2>
        <p className="mt-2 text-base text-apg-silver">
          You picked <strong className="text-white">{picked.title}</strong> · {picked.priceLabel}
        </p>
        <div className="mt-4">
          <SimpleStayRules />
        </div>
        <div className="mt-6 rounded-2xl border border-white/10 apg-glass-light p-4">
          <BedBookingPanel beds={[picked.bed]} theme="dark" onClose={() => setStep('rooms')} />
        </div>
      </div>
    );
  }

  if (step === 'rooms') {
    return (
      <div className="mx-auto max-w-lg">
        <button
          type="button"
          onClick={() => setStep('entry')}
          className="mb-4 text-sm text-apg-silver hover:text-white"
        >
          ← Back
        </button>
        <h2 className="text-2xl font-bold text-white">Pick your room type</h2>
        <p className="mt-2 text-base text-apg-silver">Choose one option. That&apos;s it.</p>
        <ul className="mt-6 space-y-4">
          {categories.map((option) => (
            <li key={option.id}>
              <div
                className={
                  'rounded-2xl border p-5 ' +
                  (option.available
                    ? 'border-white/15 apg-glass-light'
                    : 'border-white/5 opacity-50')
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-white">{option.title}</h3>
                    <p className="mt-1 text-sm text-apg-silver">{option.description}</p>
                  </div>
                  <p className="shrink-0 text-lg font-bold text-apg-orange">{option.priceLabel}</p>
                </div>
                <button
                  type="button"
                  disabled={!option.available}
                  onClick={() => chooseCategory(option.id)}
                  className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-apg-orange text-base font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {option.available ? 'Choose' : 'Full right now'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg text-center">
      {heroImage ? (
        <div className="relative mx-auto mb-6 aspect-[4/3] w-full overflow-hidden rounded-3xl border border-white/10">
          <Image src={heroImage} alt="" fill className="object-cover" priority sizes="(max-width:768px) 100vw, 480px" />
        </div>
      ) : (
        <div className="mx-auto mb-6 flex aspect-[4/3] w-full items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-apg-muted">
          {pgName}
        </div>
      )}

      <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{pgName}</h1>

      {dailyFrom > 0 ? (
        <p className="mt-4 text-2xl font-bold text-apg-orange sm:text-3xl">
          Stay here for {paiseToInr(dailyFrom)}/day
        </p>
      ) : (
        <p className="mt-4 text-lg text-apg-silver">Ask us for today&apos;s price</p>
      )}

      {fullyOccupied ? (
        <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          All rooms are full today. Try again tomorrow or pick another PG.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setStep('rooms')}
          className="mt-8 flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-apg-orange px-6 text-lg font-bold text-white shadow-lg apg-glow-btn hover:brightness-110"
        >
          Book a Room
        </button>
      )}

      <p className="mt-6 text-xs text-apg-muted">
        Simple booking · No confusing maps · Pay online in a few taps
      </p>
    </div>
  );
}
