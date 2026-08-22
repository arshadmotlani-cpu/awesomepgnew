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
import { residentProfileHref, residentTabHref } from '@/src/lib/accountNavigation';
import { requestStatusTone } from '@/src/lib/design-system/tokens';
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
  pendingDateChangePreview?: import('@/src/services/vacatingDateChange').VacatingDateChangePreview | null;
  settlementContext?: import('@/src/components/customer/account/resident/vacating/ResidentEstimatedSettlementBreakdown').ResidentSettlementStatementContext | null;
  settlementDocument?: import('@/src/lib/vacating/settlementStatementModel').SettlementStatementDocumentModel | null;
  settlementNoticeDisplay?: import('@/src/lib/vacating/noticeDeductionPresentation').NoticeSettlementDisplay | null;
  exitBrainSnapshot?: import('@/src/lib/exit/exitBrainTypes').ResidentExitBrainSnapshot | null;
};

function vacatingHomeProps(props: Props) {
  return {
    bookingId: props.bookingId,
    bookingCode: props.bookingCode ?? '',
    roomLabel: props.roomLabel,
    customerId: props.customerId,
    vacating: props.vacating,
    checkoutStatus: props.checkoutSettlementStatus ?? null,
    checkoutSettlement: props.checkoutSettlement,
    settlementWaterfall: props.checkoutSettlement?.waterfall ?? null,
    totalRefundPaise: props.checkoutSettlement?.totalRefundPaise ?? null,
    payoutUpiId: props.checkoutSettlement?.payoutUpiId ?? null,
    refundPaidAt: props.checkoutSettlement?.refundPaidAt ?? null,
    checkoutSettlementSuppressed: props.checkoutSettlementSuppressed,
    depositHeldPaise: props.depositHeldPaise ?? 0,
    durationMode: props.durationMode,
    expectedCheckoutDate: props.expectedCheckoutDate,
    monthlyRentPaise: props.monthlyRentPaise ?? 0,
    estimatedSettlement: props.estimatedSettlement,
    pendingDateChangeRequestId: props.pendingDateChangeRequestId,
    pendingDateChangePreview: props.pendingDateChangePreview,
    settlementContext: props.settlementContext,
    settlementDocument: props.settlementDocument,
    settlementNoticeDisplay: props.settlementNoticeDisplay,
    exitBrainSnapshot: props.exitBrainSnapshot,
  };
}

export function RequestsHome(props: Props) {
  const {
    customerId,
    bookingId,
    pgId,
    fromBedId,
    roomLabel,
    activeRequests,
    selectedRequestId,
    startMake,
    initialCategory = null,
    vacating,
    durationMode = 'monthly',
    expectedCheckoutDate = null,
    checkoutSettlementStatus = null,
    monthlyRentPaise = 0,
    depositHeldPaise = 0,
    moveInDate = '',
    pendingDateChangePreview = null,
    exitBrainSnapshot = null,
  } = props;

  const router = useRouter();
  const normalizedInitial = normalizeRequestCategoryId(initialCategory ?? undefined);
  const [making, setMaking] = useState(startMake);
  const [makeCategory, setMakeCategory] = useState<RequestCategoryId | null>(normalizedInitial);

  const selected = useMemo(
    () => activeRequests.find((r) => r.id === selectedRequestId) ?? null,
    [activeRequests, selectedRequestId],
  );

  const secondaryCategories = REQUEST_CATEGORIES.filter((c) => c.id !== 'move_out');

  useEffect(() => {
    if (normalizedInitial === 'move_out') {
      requestAnimationFrame(() => {
        document.getElementById('resident-move-out')?.scrollIntoView({ behavior: 'smooth' });
      });
      return;
    }
    if (normalizedInitial) {
      setMakeCategory(normalizedInitial);
      setMaking(true);
    }
  }, [normalizedInitial]);

  function openDetail(id: string) {
    router.push(residentTabHref('requests', { request: id }));
  }

  function closeDetail() {
    router.push(residentTabHref('requests'));
  }

  function selectCategory(id: RequestCategoryId) {
    if (id === 'move_out') {
      document.getElementById('resident-move-out')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    setMakeCategory(id);
    setMaking(true);
  }

  if (selected) {
    return <RequestDetailView request={selected} onBack={closeDetail} />;
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
      <div id="resident-move-out" className="space-y-4">
        <VacatingHome {...vacatingHomeProps(props)} />
      </div>

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

      {secondaryCategories.length > 0 ? (
        <details className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <summary className="cursor-pointer text-sm font-semibold text-white">Other requests</summary>
          <p className="mt-2 text-xs text-apg-silver">
            Maintenance, room change, complaints, and support — secondary to your move-out flow above.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {secondaryCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => selectCategory(cat.id)}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-xs transition hover:border-apg-orange/30"
              >
                <span className="font-semibold text-white">{cat.title}</span>
                <p className="mt-1 text-[11px] leading-snug text-apg-silver">{cat.description}</p>
              </button>
            ))}
          </div>
        </details>
      ) : null}

      <p className="text-center text-xs text-apg-silver">
        Deposit refund is in{' '}
        <Link href={residentProfileHref('wallet')} className="font-medium text-apg-orange hover:underline">
          Profile → Wallet
        </Link>
      </p>
    </div>
  );
}
