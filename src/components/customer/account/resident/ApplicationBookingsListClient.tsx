'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ACCOUNT_LINK_ON_DARK } from '@/src/components/customer/accountStyles';
import { legacyResidentTabHref } from '@/src/lib/accountNavigation';
import type { MyBookingCardModel } from '@/src/lib/account/myBookingRowPresentation';
import { partitionMyBookingCardModels } from '@/src/lib/account/myBookingRowPresentation';
import type { PaymentProofRejectionRow } from '@/src/services/paymentProofRejectionService';
import { logResidentClientInfo } from '@/src/lib/client/residentClientLogger';
import { ApplicationBookingCard } from '@/src/components/customer/account/resident/ApplicationBookingCard';
import { ApplicationBookingCardErrorBoundary } from '@/src/components/customer/account/resident/ApplicationBookingCardErrorBoundary';
import { surface } from '@/src/lib/design-system/tokens';

type Props = {
  models: MyBookingCardModel[];
  showResidentHome?: boolean;
  customerId?: string | null;
  email?: string | null;
  rejections?: PaymentProofRejectionRow[];
};

function BookingListSection({
  models,
  customerId,
  email,
  rejectionByBookingId,
}: {
  models: MyBookingCardModel[];
  customerId?: string | null;
  email?: string | null;
  rejectionByBookingId: Map<string, PaymentProofRejectionRow>;
}) {
  return (
    <ul className="space-y-4">
      {models.map((model) => (
        <ApplicationBookingCardErrorBoundary
          key={model.id}
          bookingId={model.id}
          bookingCode={model.bookingCode}
          customerId={customerId}
          email={email}
        >
          <ApplicationBookingCard
            model={model}
            rejection={rejectionByBookingId.get(model.id) ?? null}
          />
        </ApplicationBookingCardErrorBoundary>
      ))}
    </ul>
  );
}

export function ApplicationBookingsListClient({
  models,
  showResidentHome = false,
  customerId = null,
  email = null,
  rejections = [],
}: Props) {
  const { open, closed } = partitionMyBookingCardModels(models);
  const [showClosed, setShowClosed] = useState(false);

  const rejectionByBookingId = useMemo(() => {
    const map = new Map<string, PaymentProofRejectionRow>();
    for (const row of rejections) {
      if (!row.bookingId) continue;
      const existing = map.get(row.bookingId);
      if (!existing || new Date(row.rejectedAt) > new Date(existing.rejectedAt)) {
        map.set(row.bookingId, row);
      }
    }
    return map;
  }, [rejections]);

  const rejectedOpen = open.filter((m) => rejectionByBookingId.has(m.id));
  const rejectedClosed = closed.filter((m) => rejectionByBookingId.has(m.id));
  const hasRejected = rejectedOpen.length + rejectedClosed.length > 0;

  useEffect(() => {
    logResidentClientInfo('account bookings list mounted', {
      page: 'account_bookings',
      customerId,
      email,
      extra: {
        bookingCount: models.length,
        openCount: open.length,
        closedCount: closed.length,
        rejectionCount: rejections.length,
        warningCount: models.filter((m) => m.warnings.length > 0).length,
        statuses: models.map((m) => m.status),
        durationModes: models.map((m) => m.durationMode),
      },
    });
  }, [customerId, email, models, open.length, closed.length, rejections.length]);

  if (models.length === 0) {
    return (
      <div className={`${surface.residentGlassPadded} text-center`}>
        <p className="font-semibold text-white">No bookings yet</p>
        <Link href="/pgs" className={`mt-3 inline-block ${ACCOUNT_LINK_ON_DARK}`}>
          Find a PG →
        </Link>
      </div>
    );
  }

  const latestLinkable = open.find((m) => m.isLinkable) ?? models.find((m) => m.isLinkable) ?? null;

  return (
    <div className="space-y-6">
      <section className={surface.residentGlassPadded}>
        <h2 className="text-base font-semibold text-white">What to do next</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Open your booking to pay, upload identity, or see check-in details.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {latestLinkable?.bookingHref ? (
            <Link
              href={latestLinkable.bookingHref}
              className="apg-glow-btn inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
            >
              Open latest booking
            </Link>
          ) : (
            <p className="text-sm text-amber-200">
              Your latest booking is missing a code — contact the PG office for help.
            </p>
          )}
          {showResidentHome ? (
            <Link
              href={legacyResidentTabHref('home')}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white hover:border-white/25"
            >
              Resident home
            </Link>
          ) : null}
        </div>
      </section>

      {hasRejected ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-rose-200">Payment rejected — action needed</h2>
          <BookingListSection
            models={[...rejectedOpen, ...rejectedClosed]}
            customerId={customerId}
            email={email}
            rejectionByBookingId={rejectionByBookingId}
          />
        </div>
      ) : null}

      {open.filter((m) => !rejectionByBookingId.has(m.id)).length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-white">Active bookings</h2>
          <BookingListSection
            models={open.filter((m) => !rejectionByBookingId.has(m.id))}
            customerId={customerId}
            email={email}
            rejectionByBookingId={rejectionByBookingId}
          />
        </div>
      ) : null}

      {closed.filter((m) => !rejectionByBookingId.has(m.id)).length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Closed bookings</h2>
            <button
              type="button"
              onClick={() => setShowClosed((value) => !value)}
              className="text-sm font-medium text-[#FF5A1F] hover:brightness-110"
            >
              {showClosed
                ? 'Hide closed bookings'
                : `Show closed bookings (${closed.filter((m) => !rejectionByBookingId.has(m.id)).length})`}
            </button>
          </div>
          {showClosed ? (
            <BookingListSection
              models={closed.filter((m) => !rejectionByBookingId.has(m.id))}
              customerId={customerId}
              email={email}
              rejectionByBookingId={rejectionByBookingId}
            />
          ) : (
            <p className={`${surface.residentGlassPadded} text-sm text-apg-silver`}>
              Superseded, cancelled, completed, and refunded bookings are hidden by default.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
