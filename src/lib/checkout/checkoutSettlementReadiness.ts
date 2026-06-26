import { hasCheckoutElectricityEvidence } from '@/src/lib/checkout/checkoutElectricityEvidence';
import { noticeDeductionAppliesToBooking } from '@/src/lib/checkout/noticeDeductionPolicy';
import { adminStayTypeLabel } from '@/src/lib/stayType';

export type CheckoutSettlementReadinessInput = {
  status: string;
  amountsLocked: boolean;
  stayType?: string | null;
  durationMode?: string | null;
  payoutUpiId?: string | null;
  payoutQrUrl?: string | null;
  electricityUseAverage?: boolean | null;
  meterPhotoMissing?: boolean | null;
  depositRefundablePaise: number;
  electricityMeterPhotoUrl?: string | null;
  electricitySharePaise?: number | null;
  electricityCalculationMethod?: string | null;
  preview: {
    finalRefundPaise: number;
    noticeDeductionPaise: number;
    electricityDeductionPaise: number;
  };
};

export type CheckoutReadinessItem = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type CheckoutSettlementReadiness = {
  items: CheckoutReadinessItem[];
  ready: boolean;
  blockingReasons: string[];
  stayTypeLabel: string;
  isFixedStay: boolean;
};

export function assessCheckoutSettlementReadiness(
  detail: CheckoutSettlementReadinessInput,
): CheckoutSettlementReadiness {
  const isFixedStay = !noticeDeductionAppliesToBooking({
    stayType: detail.stayType,
    durationMode: detail.durationMode,
  });
  const preview = detail.preview;
  const zeroRefund = preview.finalRefundPaise <= 0;
  const electricityReady = hasCheckoutElectricityEvidence(detail);
  const refundDetailsReady =
    zeroRefund || Boolean(detail.payoutUpiId?.trim()) || Boolean(detail.payoutQrUrl?.trim());

  const items: CheckoutReadinessItem[] = [
    {
      id: 'meter',
      label: 'Final AC meter photo (or average billing)',
      ok: electricityReady,
      detail: electricityReady
        ? detail.electricityUseAverage
          ? 'Average billing selected'
          : detail.meterPhotoMissing
            ? 'Meter photo marked missing'
            : 'Meter photo uploaded'
        : 'Waiting for meter photo or average billing choice',
    },
    {
      id: 'electricity',
      label: 'Electricity share calculated',
      ok: electricityReady && preview.electricityDeductionPaise >= 0,
      detail:
        preview.electricityDeductionPaise > 0
          ? `₹${(preview.electricityDeductionPaise / 100).toFixed(2)} from deposit`
          : electricityReady
            ? 'No electricity deduction'
            : 'Calculate electricity after meter evidence',
    },
    {
      id: 'refund_details',
      label: 'Refund UPI / QR',
      ok: refundDetailsReady,
      detail: refundDetailsReady
        ? zeroRefund
          ? 'No refund due — UPI not required'
          : detail.payoutUpiId?.trim()
            ? `UPI: ${detail.payoutUpiId}`
            : 'Refund QR uploaded'
        : 'Resident must submit payout details',
    },
    {
      id: 'deposit',
      label: 'Deposit held verified',
      ok: detail.depositRefundablePaise >= 0,
      detail: `Held ₹${(detail.depositRefundablePaise / 100).toFixed(2)}`,
    },
    {
      id: 'notice',
      label: 'Notice fee policy',
      ok: isFixedStay ? preview.noticeDeductionPaise === 0 : true,
      detail: isFixedStay
        ? preview.noticeDeductionPaise === 0
          ? 'Fixed stay — no notice fee'
          : `Invalid notice fee ₹${(preview.noticeDeductionPaise / 100).toFixed(2)} on fixed stay`
        : preview.noticeDeductionPaise > 0
          ? `Notice fee ₹${(preview.noticeDeductionPaise / 100).toFixed(2)}`
          : 'Compliant notice — no fee',
    },
    {
      id: 'admin_review',
      label: 'Ready for admin review',
      ok: detail.status === 'awaiting_admin_review' || detail.status === 'approved',
      detail:
        detail.status === 'awaiting_resident_details'
          ? 'Waiting on resident uploads'
          : detail.status === 'awaiting_admin_review'
            ? 'Resident steps complete'
            : titleCaseStatus(detail.status),
    },
  ];

  const blockingReasons = items.filter((i) => !i.ok).map((i) => i.detail);
  const residentStepsComplete = electricityReady && refundDetailsReady;
  const ready =
    !detail.amountsLocked &&
    residentStepsComplete &&
    (isFixedStay ? preview.noticeDeductionPaise === 0 : true) &&
    (detail.status === 'awaiting_admin_review' ||
      (zeroRefund && detail.status === 'awaiting_resident_details' && electricityReady));

  return {
    items,
    ready,
    blockingReasons,
    stayTypeLabel: adminStayTypeLabel({
      stayType: detail.stayType,
      durationMode: detail.durationMode,
    }),
    isFixedStay,
  };
}

function titleCaseStatus(status: string): string {
  return status.replace(/_/g, ' ');
}
