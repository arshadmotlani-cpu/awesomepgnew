'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ApgCard } from '@/src/components/customer/design-system';
import { RoomChangeFlow } from '@/src/components/customer/account/resident/requests/RoomChangeFlow';
import { VacatingHome } from '@/src/components/customer/account/resident/vacating/VacatingHome';
import { RequestDetailView } from '@/src/components/customer/account/resident/requests/RequestDetailView';
import { type ActiveRequestItem } from '@/src/lib/residents/requestCenter';
import { residentTabHref } from '@/src/lib/accountNavigation';
import { primaryBtn } from '@/src/lib/design-system/tokens';
import { formatDate } from '@/src/lib/format';
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
  initialCategory?: string | null;
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

type SectionId = 'move_out' | 'change_bed';
type SectionStage = 'closed' | 'brief' | 'form';

const MOVE_OUT_POINTS = [
  "Give at least 5 days' notice.",
  'Your selected date is your final stay date.',
  'Your bed becomes available the next day.',
  'Rent is charged through your final stay date.',
  'Electricity is calculated through your stay.',
  'Final settlement happens after you leave.',
  'Eligible unused prepaid rent is credited after settlement.',
];

const CHANGE_BED_POINTS = [
  'Choose an available bed in your PG.',
  'Your current bed stays yours until the change is completed.',
  'Pricing is calculated automatically.',
  'Any rent/deposit difference becomes payable.',
  'Your new bed is secured before the transfer.',
  'Once accepted, the change happens automatically.',
  'Your current rent updates to the new bed after transfer.',
];

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
    bookingStatus: props.bookingStatus,
  };
}

function RequestAccordion({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <ApgCard tier="resident">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-apg-orange"
      >
        <span>
          <span className="block text-sm font-semibold uppercase tracking-wide text-white">
            {title}
          </span>
          <span className="mt-1 block text-xs leading-snug text-apg-silver">{summary}</span>
        </span>
        <span className="shrink-0 text-xs font-medium text-apg-orange" aria-hidden>
          {open ? '▲' : 'View details →'}
        </span>
      </button>
      {open ? (
        <div id={`${id}-panel`} className="mt-4 border-t border-white/10 pt-4">
          {children}
        </div>
      ) : null}
    </ApgCard>
  );
}

export function RequestsHome(props: Props) {
  const {
    pgId,
    fromBedId,
    roomLabel,
    activeRequests,
    selectedRequestId,
    vacating,
    monthlyRentPaise = 0,
    depositHeldPaise = 0,
    moveInDate = '',
  } = props;

  const router = useRouter();
  void props.startMake;
  void props.initialCategory;
  const [openSection, setOpenSection] = useState<SectionId | null>(null);
  const [moveOutStage, setMoveOutStage] = useState<SectionStage>('closed');
  const [changeBedStage, setChangeBedStage] = useState<SectionStage>('closed');

  const selected = useMemo(
    () => activeRequests.find((r) => r.id === selectedRequestId) ?? null,
    [activeRequests, selectedRequestId],
  );

  const changeBedRequest = useMemo(
    () =>
      activeRequests.find(
        (r) => r.type === 'room_change' && !['completed', 'cancelled', 'rejected', 'expired'].includes(r.status),
      ) ?? null,
    [activeRequests],
  );

  const moveOutActive =
    vacating != null && (vacating.status === 'pending' || vacating.status === 'approved');

  function toggleSection(id: SectionId) {
    if (openSection === id) {
      setOpenSection(null);
      setMoveOutStage('closed');
      setChangeBedStage('closed');
      return;
    }
    setOpenSection(id);
    if (id === 'move_out') {
      setMoveOutStage('brief');
      setChangeBedStage('closed');
    } else {
      setChangeBedStage('brief');
      setMoveOutStage('closed');
    }
  }

  function openDetail(id: string) {
    router.push(residentTabHref('requests', { request: id }));
  }

  function closeDetail() {
    router.push(residentTabHref('requests'));
  }

  if (selected) {
    return <RequestDetailView request={selected} onBack={closeDetail} />;
  }

  return (
    <div className="space-y-3 pb-2">
      {moveOutActive && vacating?.vacatingDate ? (
        <ApgCard tier="resident">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-apg-orange">
            Move-out request
          </p>
          <p className="mt-1 text-sm text-white">
            Requested: {formatDate(vacating.vacatingDate)}
          </p>
          <p className="mt-0.5 text-xs capitalize text-apg-silver">
            Status: {vacating.status.replace(/_/g, ' ')}
          </p>
          <button
            type="button"
            className="mt-3 text-xs font-semibold text-apg-orange hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-apg-orange"
            onClick={() => {
              setOpenSection('move_out');
              setMoveOutStage('form');
              setChangeBedStage('closed');
            }}
          >
            View details
          </button>
        </ApgCard>
      ) : null}

      {changeBedRequest ? (
        <ApgCard tier="resident">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-apg-orange">
            Change bed
          </p>
          <p className="mt-1 text-sm text-white">Current: {roomLabel}</p>
          <p className="mt-0.5 text-xs capitalize text-apg-silver">
            Status: {changeBedRequest.status.replace(/_/g, ' ')}
          </p>
          <button
            type="button"
            className="mt-3 text-xs font-semibold text-apg-orange hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-apg-orange"
            onClick={() => openDetail(changeBedRequest.id)}
          >
            View details
          </button>
        </ApgCard>
      ) : null}

      <div id="resident-move-out">
        <RequestAccordion
          id="move-out"
          title="Move out"
          summary="Plan your move-out and final settlement."
          open={openSection === 'move_out'}
          onToggle={() => toggleSection('move_out')}
        >
          {moveOutStage === 'form' ? (
            <VacatingHome
              {...vacatingHomeProps(props)}
              onBackToRequests={() => setMoveOutStage('brief')}
            />
          ) : (
            <>
              <ul className="space-y-1.5 text-sm leading-snug text-apg-silver">
                {MOVE_OUT_POINTS.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="text-apg-orange" aria-hidden>
                      •
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={`${primaryBtn} mt-4 w-full`}
                onClick={() => setMoveOutStage('form')}
              >
                Continue to Move Out
              </button>
            </>
          )}
        </RequestAccordion>
      </div>

      <RequestAccordion
        id="change-bed"
        title="Change bed"
        summary="Move to another available bed in your PG."
        open={openSection === 'change_bed'}
        onToggle={() => toggleSection('change_bed')}
      >
        {changeBedStage === 'form' ? (
          <RoomChangeFlow
            bookingId={props.bookingId}
            pgId={pgId}
            fromBedId={fromBedId}
            roomLabel={roomLabel}
            monthlyRentPaise={monthlyRentPaise}
            depositHeldPaise={depositHeldPaise}
            moveInDate={moveInDate}
            onClose={() => setChangeBedStage('brief')}
          />
        ) : (
          <>
            <ul className="space-y-1.5 text-sm leading-snug text-apg-silver">
              {CHANGE_BED_POINTS.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="text-apg-orange" aria-hidden>
                    •
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={`${primaryBtn} mt-4 w-full`}
              onClick={() => setChangeBedStage('form')}
            >
              Continue to Change Bed
            </button>
          </>
        )}
      </RequestAccordion>
    </div>
  );
}
