'use client';

import Link from 'next/link';
import type { MyBookingCardModel } from '@/src/lib/account/myBookingRowPresentation';
import { myBookingStatusChipClass } from '@/src/lib/booking/bookingStatus';
import { ACCOUNT_LINK_IN_SURFACE } from '@/src/components/customer/accountStyles';

function StatusBadge({ model }: { model: MyBookingCardModel }) {
  const tone =
    model.status === 'invalid'
      ? 'bg-amber-50 text-amber-800 ring-amber-200'
      : myBookingStatusChipClass(model.status);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      {model.statusLabel}
    </span>
  );
}

export function ApplicationBookingCard({ model }: { model: MyBookingCardModel }) {
  if (model.warnings.length > 0 && !model.isLinkable) {
    return (
      <li className="px-4 py-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-950">Incomplete booking record</p>
          <p className="mt-1 text-sm text-amber-900">
            This booking is missing required details and cannot be opened yet.
          </p>
          <ul className="mt-2 list-inside list-disc text-xs text-amber-800">
            {model.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      </li>
    );
  }

  const codeLabel = model.bookingCode ?? model.id;
  const subtitleParts = [
    model.pgName,
    model.bedCountLabel,
    model.checkInLabel ? `Check-in ${model.checkInLabel}` : null,
  ].filter(Boolean);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
      <div className="min-w-0">
        {model.bookingHref ? (
          <Link
            href={model.bookingHref}
            className={`font-mono text-sm font-semibold ${ACCOUNT_LINK_IN_SURFACE}`}
          >
            {codeLabel}
          </Link>
        ) : (
          <p className="font-mono text-sm font-semibold text-zinc-900">{codeLabel}</p>
        )}
        <p className="mt-0.5 text-sm text-zinc-800">{subtitleParts.join(' · ')}</p>
        <p className="text-xs text-zinc-600">
          {model.durationLabel} · {model.totalLabel}
        </p>
        {model.status === 'superseded' ? (
          <p className="mt-2 text-xs text-violet-800">
            Replaced by a newer confirmed booking.
          </p>
        ) : null}
        {model.warnings.length > 0 ? (
          <p className="mt-2 text-xs text-amber-700">{model.warnings.join(' · ')}</p>
        ) : null}
      </div>
      <StatusBadge model={model} />
    </li>
  );
}
