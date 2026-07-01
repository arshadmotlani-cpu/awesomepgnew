'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import {
  ACCOUNT_LINK_ON_DARK,
  ACCOUNT_SURFACE,
} from '@/src/components/customer/accountStyles';
import { legacyResidentTabHref, residentTabHref } from '@/src/lib/accountNavigation';
import type { MyBookingCardModel } from '@/src/lib/account/myBookingRowPresentation';
import { logResidentClientInfo } from '@/src/lib/client/residentClientLogger';
import { ApplicationBookingCard } from '@/src/components/customer/account/resident/ApplicationBookingCard';
import { ApplicationBookingCardErrorBoundary } from '@/src/components/customer/account/resident/ApplicationBookingCardErrorBoundary';

type Props = {
  models: MyBookingCardModel[];
  showResidentHome?: boolean;
  customerId?: string | null;
  email?: string | null;
};

export function ApplicationBookingsListClient({
  models,
  showResidentHome = false,
  customerId = null,
  email = null,
}: Props) {
  useEffect(() => {
    logResidentClientInfo('account bookings list mounted', {
      page: 'account_bookings',
      customerId,
      email,
      extra: {
        bookingCount: models.length,
        warningCount: models.filter((m) => m.warnings.length > 0).length,
        statuses: models.map((m) => m.status),
        durationModes: models.map((m) => m.durationMode),
      },
    });
  }, [customerId, email, models]);

  if (models.length === 0) {
    return (
      <div className={`${ACCOUNT_SURFACE} p-8 text-center text-sm text-zinc-600`}>
        <p className="font-semibold text-zinc-900">No bookings yet</p>
        <Link href="/pgs" className={`mt-3 inline-block ${ACCOUNT_LINK_ON_DARK}`}>
          Find a PG →
        </Link>
      </div>
    );
  }

  const latestLinkable = models.find((m) => m.isLinkable) ?? null;

  return (
    <div className="space-y-6">
      <section className={`${ACCOUNT_SURFACE} p-5`}>
        <h2 className="text-base font-semibold text-zinc-900">What to do next</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Open your booking to pay, upload identity, or see check-in details.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {latestLinkable?.bookingHref ? (
            <Link
              href={latestLinkable.bookingHref}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
            >
              Open latest booking
            </Link>
          ) : (
            <p className="text-sm text-amber-800">
              Your latest booking is missing a code — contact the PG office for help.
            </p>
          )}
          {showResidentHome ? (
            <Link
              href={legacyResidentTabHref('home')}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Resident home
            </Link>
          ) : null}
        </div>
      </section>

      <ul className={`${ACCOUNT_SURFACE} divide-y divide-zinc-200`}>
        {models.map((model) => (
          <ApplicationBookingCardErrorBoundary
            key={model.id}
            bookingId={model.id}
            bookingCode={model.bookingCode}
            customerId={customerId}
            email={email}
          >
            <ApplicationBookingCard model={model} />
          </ApplicationBookingCardErrorBoundary>
        ))}
      </ul>
    </div>
  );
}
