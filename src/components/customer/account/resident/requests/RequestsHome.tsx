'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApgCard } from '@/src/components/customer/design-system';
import { StatusChip } from '@/src/components/customer/design-system';
import { RequestsMakeFlow } from '@/src/components/customer/account/resident/requests/RequestsMakeFlow';
import { RequestDetailView } from '@/src/components/customer/account/resident/requests/RequestDetailView';
import { RoomChangeFlow } from '@/src/components/customer/account/resident/requests/RoomChangeFlow';
import { VacatingHome } from '@/src/components/customer/account/resident/vacating/VacatingHome';
import { ResidentSectionErrorBoundary } from '@/src/components/customer/account/resident/ResidentSectionErrorBoundary';
import {
  nextStepForRequest,
  REQUEST_CATEGORIES,
  REQUEST_TIMELINE_STAGES,
  requestStatusToTimelineIndex,
  normalizeRequestCategoryId,
  type ActiveRequestItem,
  type RequestCategoryId,
} from '@/src/lib/residents/requestCenter';
import { accountProfileHref, residentProfileHref, residentTabHref } from '@/src/lib/accountNavigation';
import { requestStatusTone, primaryBtn } from '@/src/lib/design-system/tokens';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';

type Props = {
  customerId: string;
  bookingId: string;
  bookingCode?: string | null;
  pgId: string;
  fromBedId: string;
  roomLabel: string;
  refundableBalancePaise: number;
  hasDepositDue: boolean;
  activeRequests: ActiveRequestItem[];
  selectedRequestId: string | null;
  startMake: boolean;
  initialCategory?: RequestCategoryId | null;
  vacating: VacatingForBookingRow | null;
  bookingStatus?: string;
  durationMode?: string;
  expectedCheckoutDate?: string | null;
  bookingCreatedAt?: Date | string;
  checkoutSettlementStatus?: string | null;
  checkoutSettlement?: {
    status: string;
    rejectionReason?: string | null;
    waterfall?: import('@/src/lib/checkout/checkoutSettlementEngineV2').CheckoutSettlementWaterfall | null;
    totalRefundPaise?: number | null;
    payoutUpiId?: string | null;
    refundPaidAt?: Date | string | null;
  } | null;
  checkoutSettlementSuppressed?: boolean;
  monthlyRentPaise?: number;
  depositHeldPaise?: number;
  moveInDate?: string;
  developerTestEmail?: string | null;
  estimatedSettlement?: import('@/src/lib/vacating/estimatedSettlementPreview').EstimatedSettlementPreview | null;
  pendingDateChangeRequestId?: string | null;
  settlementContext?: import('@/src/components/customer/account/resident/vacating/ResidentEstimatedSettlementBreakdown').ResidentSettlementStatementContext | null;
  settlementDocument?: import('@/src/lib/vacating/settlementStatementModel').SettlementStatementDocumentModel | null;
  settlementNoticeDisplay?: import('@/src/lib/vacating/noticeDeductionPresentation').NoticeSettlementDisplay | null;
};

export function RequestsHome({
  customerId,
  bookingId,
  bookingCode = null,
  pgId,
  fromBedId,
  roomLabel,
  refundableBalancePaise,
  hasDepositDue,
  activeRequests,
  selectedRequestId,
  startMake,
  initialCategory = null,
  vacating,
  bookingStatus = 'confirmed',
  durationMode = 'monthly',
  expectedCheckoutDate = null,
  bookingCreatedAt,
  checkoutSettlementStatus = null,
  checkoutSettlement = null,
  checkoutSettlementSuppressed = false,
  monthlyRentPaise = 0,
  depositHeldPaise = 0,
  moveInDate = '',
  developerTestEmail = null,
  estimatedSettlement = null,
  pendingDateChangeRequestId = null,
  settlementContext = null,
  settlementDocument = null,
  settlementNoticeDisplay = null,
}: Props) {
  const router = useRouter();
  const normalizedInitial = normalizeRequestCategoryId(initialCategory ?? undefined);
  const [making, setMaking] = useState(startMake);
  const [makeCategory, setMakeCategory] = useState<RequestCategoryId | null>(normalizedInitial);

  const selected = useMemo(
    () => activeRequests.find((r) => r.id === selectedRequestId) ?? null,
    [activeRequests, selectedRequestId],
  );

  useEffect(() => {
    if (normalizedInitial) {
      setMakeCategory(normalizedInitial);
      setMaking(true);
    }
  }, [normalizedInitial]);

  const visibleCategories = REQUEST_CATEGORIES;

  function openDetail(id: string) {
    router.push(accountProfileHref('resident', { tab: 'requests', request: id }));
  }

  function closeDetail() {
    router.push(residentTabHref('requests'));
  }

  function selectCategory(id: RequestCategoryId) {
    setMakeCategory(id);
    setMaking(true);
  }

  if (selected) {
    return <RequestDetailView request={selected} onBack={closeDetail} />;
  }

  if (making && makeCategory === 'move_out') {
    return (
      <VacatingHome
        bookingId={bookingId}
        bookingCode={bookingCode ?? ''}
        roomLabel={roomLabel}
        customerId={customerId}
        vacating={vacating}
        checkoutStatus={checkoutSettlementStatus}
        checkoutSettlement={checkoutSettlement}
        settlementWaterfall={checkoutSettlement?.waterfall ?? null}
        totalRefundPaise={checkoutSettlement?.totalRefundPaise ?? null}
        payoutUpiId={checkoutSettlement?.payoutUpiId ?? null}
        refundPaidAt={checkoutSettlement?.refundPaidAt ?? null}
        checkoutSettlementSuppressed={checkoutSettlementSuppressed}
        depositHeldPaise={depositHeldPaise}
        durationMode={durationMode}
        expectedCheckoutDate={expectedCheckoutDate}
        monthlyRentPaise={monthlyRentPaise}
        estimatedSettlement={estimatedSettlement}
        pendingDateChangeRequestId={pendingDateChangeRequestId}
        settlementContext={settlementContext}
        settlementDocument={settlementDocument}
        settlementNoticeDisplay={settlementNoticeDisplay}
      />
    );
  }

  if (making && makeCategory === 'room_change') {
    return (
      <RoomChangeFlow
        bookingId={bookingId}
        pgId={pgId}
        fromBedId={fromBedId}
        roomLabel={roomLabel}
        monthlyRentPaise={monthlyRentPaise}
        depositHeldPaise={depositHeldPaise}
        moveInDate={moveInDate}
        onClose={() => {
          setMaking(false);
          setMakeCategory(null);
        }}
      />
    );
  }

  if (making && makeCategory) {
    return (
      <ResidentSectionErrorBoundary
        page="requests_make"
        bookingId={bookingId}
        customerId={customerId}
        title="Request could not load"
      >
        <RequestsMakeFlow
          bookingId={bookingId}
          roomLabel={roomLabel}
          initialCategory={makeCategory}
          onClose={() => {
            setMaking(false);
            setMakeCategory(null);
          }}
        />
      </ResidentSectionErrorBoundary>
    );
  }

  return (
    <div className="space-y-4 pb-2">
      <ApgCard tier="resident">
        <h2 className="text-lg font-semibold text-white">Requests</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Maintenance, room change, move-out, complaints, and support — each with a clear status.
        </p>
      </ApgCard>

      {activeRequests.length > 0 ? (
        <ApgCard tier="resident">
          <h2 className="text-sm font-semibold text-white">Active requests</h2>
          <ul className="mt-3 space-y-3">
            {activeRequests.slice(0, 8).map((r) => {
              const stepIndex = requestStatusToTimelineIndex(r.status);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => openDetail(r.id)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-apg-orange/30"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">{r.typeLabel}</span>
                      <StatusChip status={r.status} toneMap={requestStatusTone} />
                    </div>
                    <p className="mt-2 text-xs text-apg-silver">
                      {nextStepForRequest(r.status, r.type)}
                    </p>
                    <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-apg-silver/80">
                      Step {stepIndex + 1} of {REQUEST_TIMELINE_STAGES.length}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </ApgCard>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-white">Start a request</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleCategories.map((cat) => (
            <CategoryCard
              key={cat.id}
              title={cat.title}
              description={cat.description}
              onSelect={() => selectCategory(cat.id)}
            />
          ))}
        </div>
      </section>

      <p className="text-center text-xs text-apg-silver">
        Deposit refund is in{' '}
        <Link href={residentProfileHref('wallet')} className="font-medium text-apg-orange hover:underline">
          Profile → Wallet
        </Link>
      </p>
    </div>
  );
}

function CategoryCard({
  title,
  description,
  onSelect,
}: {
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-apg-orange/35 hover:bg-white/[0.06]"
    >
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-apg-silver">{description}</p>
    </button>
  );
}
