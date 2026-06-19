'use client';

import { ApgCard } from '@/src/components/customer/design-system';
import { AmenityList } from '@/src/components/customer/AmenityList';
import { formatDate, paiseToInr } from '@/src/lib/format';

type Props = {
  pgName: string;
  roomNumber: string;
  bedCode: string;
  monthlyRentPaise: number;
  checkInDate: string;
  expectedCheckoutDate: string | null;
  amenities?: Record<string, unknown>;
  capacity: number;
};

export function MyRoomPanel({
  pgName,
  roomNumber,
  bedCode,
  monthlyRentPaise,
  checkInDate,
  expectedCheckoutDate,
  amenities = {},
  capacity,
}: Props) {
  return (
    <ApgCard tier="account" className="space-y-4 p-5">
      <div>
        <h3 className="text-lg font-semibold text-zinc-900">Your room</h3>
        <p className="mt-1 text-sm text-zinc-600">
          {pgName} · Room {roomNumber} · Bed {bedCode}
        </p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-zinc-500">Monthly rent</dt>
          <dd className="tabular-nums font-semibold text-zinc-900">{paiseToInr(monthlyRentPaise)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Check-in</dt>
          <dd className="font-semibold text-zinc-900">{formatDate(checkInDate)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Stay</dt>
          <dd className="font-semibold text-zinc-900">
            {expectedCheckoutDate ? `Until ${formatDate(expectedCheckoutDate)}` : 'Open-ended'}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Sharing</dt>
          <dd className="font-semibold text-zinc-900">{capacity}-sharing room</dd>
        </div>
      </dl>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Roommates</p>
        <p className="mt-1 text-sm text-zinc-600">
          Up to {Math.max(0, capacity - 1)} other resident{capacity - 1 === 1 ? '' : 's'} may share
          this room. Names are private — contact support for roommate coordination.
        </p>
      </div>
      {Object.keys(amenities).length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Included amenities
          </p>
          <AmenityList amenities={amenities} variant="light" />
        </div>
      ) : null}
    </ApgCard>
  );
}
