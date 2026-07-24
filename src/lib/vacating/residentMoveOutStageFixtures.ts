import type { VacatingForBookingRow } from '@/src/db/queries/customer';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { kunalShapedStoryFixtureWaterfall } from '@/src/lib/residents/residentMoveOutSettlementStory';
import type { EstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';
import { estimatedSettlementFromCheckoutWaterfall } from '@/src/lib/vacating/estimatedSettlementPreview';

export type ResidentMoveOutStageId =
  | 'pending'
  | 'approved'
  | 'request_refund'
  | 'under_review'
  | 'completed';

const BOOKING_ID = '00000000-0000-4000-8000-000000000048';

function baseVacating(
  overrides: Partial<VacatingForBookingRow> & Pick<VacatingForBookingRow, 'status' | 'vacatingDate'>,
): VacatingForBookingRow {
  return {
    id: 'vr-stage-preview',
    bookingId: BOOKING_ID,
    noticeGivenDate: '2026-07-21',
    vacatingDate: overrides.vacatingDate,
    noticeCompliant: false,
    deductionPaise: 27_500,
    depositRefundPaise: 0,
    monthlyRentPaiseSnapshot: 150_000,
    noticeRentCoveredDays: 0,
    noticeChargeableDays: 14,
    noticeBreakdownJson: null,
    status: overrides.status,
    notes: null,
    checkoutSettlementSuppressed: false,
    resolvedAt: null,
    createdAt: new Date('2026-07-21'),
    ...overrides,
  };
}

function buildEstimate(vacatingDate: string): EstimatedSettlementPreview {
  const waterfall = kunalShapedStoryFixtureWaterfall();
  return estimatedSettlementFromCheckoutWaterfall({
    detail: {
      bookingId: BOOKING_ID,
      noticeGivenDate: '2026-07-21',
      vacatingDate,
      monthlyRentPaiseSnapshot: 150_000,
      noticeRentCoveredDays: 0,
      noticeChargeableDays: 14,
      noticeDeductionPaise: 27_500,
      depositRefundablePaise: 412_100,
      preview: { electricityDeductionPaise: 0 },
      approvalBaselineLocked: false,
      amountsLocked: false,
    },
    waterfall,
  });
}

export type ResidentMoveOutStageVacatingHomeProps = {
  stage: ResidentMoveOutStageId;
  vacating: VacatingForBookingRow;
  checkoutStatus: string | null;
  checkoutSettlement: {
    status: string;
    rejectionReason?: string | null;
    payoutUpiId?: string | null;
    refundPaidAt?: Date | string | null;
  } | null;
  estimatedSettlement: EstimatedSettlementPreview;
  settlementWaterfall: CheckoutSettlementWaterfall | null;
  totalRefundPaise: number | null;
  payoutUpiId: string | null;
  refundPaidAt: Date | string | null;
};

export function buildResidentMoveOutStageProps(stage: ResidentMoveOutStageId): ResidentMoveOutStageVacatingHomeProps {
  const waterfall = kunalShapedStoryFixtureWaterfall();
  switch (stage) {
    case 'pending':
      return {
        stage,
        vacating: baseVacating({ status: 'pending', vacatingDate: '2026-08-01' }),
        checkoutStatus: null,
        checkoutSettlement: null,
        estimatedSettlement: buildEstimate('2026-08-01'),
        settlementWaterfall: null,
        totalRefundPaise: null,
        payoutUpiId: null,
        refundPaidAt: null,
      };
    case 'approved':
      return {
        stage,
        vacating: baseVacating({ status: 'approved', vacatingDate: '2026-08-15' }),
        checkoutStatus: null,
        checkoutSettlement: null,
        estimatedSettlement: buildEstimate('2026-08-15'),
        settlementWaterfall: null,
        totalRefundPaise: null,
        payoutUpiId: null,
        refundPaidAt: null,
      };
    case 'request_refund':
      return {
        stage,
        vacating: baseVacating({ status: 'approved', vacatingDate: '2026-07-20' }),
        checkoutStatus: 'awaiting_resident_details',
        checkoutSettlement: { status: 'awaiting_resident_details' },
        estimatedSettlement: buildEstimate('2026-07-20'),
        settlementWaterfall: null,
        totalRefundPaise: null,
        payoutUpiId: null,
        refundPaidAt: null,
      };
    case 'under_review':
      return {
        stage,
        vacating: baseVacating({ status: 'approved', vacatingDate: '2026-07-20' }),
        checkoutStatus: 'awaiting_admin_review',
        checkoutSettlement: { status: 'awaiting_admin_review' },
        estimatedSettlement: buildEstimate('2026-07-20'),
        settlementWaterfall: waterfall,
        totalRefundPaise: waterfall.refund.totalPaise,
        payoutUpiId: 'kunal@upi',
        refundPaidAt: null,
      };
    case 'completed':
      return {
        stage,
        vacating: baseVacating({ status: 'approved', vacatingDate: '2026-07-20' }),
        checkoutStatus: 'refund_paid',
        checkoutSettlement: {
          status: 'refund_paid',
          payoutUpiId: 'kunal@upi',
          refundPaidAt: '2026-07-23',
        },
        estimatedSettlement: buildEstimate('2026-07-20'),
        settlementWaterfall: waterfall,
        totalRefundPaise: waterfall.refund.totalPaise,
        payoutUpiId: 'kunal@upi',
        refundPaidAt: '2026-07-23',
      };
  }
}
