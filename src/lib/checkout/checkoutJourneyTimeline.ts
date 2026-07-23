import { hasCheckoutElectricityEvidence } from '@/src/lib/checkout/checkoutElectricityEvidence';
import { noticeDeductionAppliesToBooking } from '@/src/lib/checkout/noticeDeductionPolicy';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

export type JourneyTimelineItem = {
  id: string;
  label: string;
  state: 'done' | 'current' | 'upcoming';
};

export function buildCheckoutJourneyTimeline(detail: CheckoutSettlementDetail): JourneyTimelineItem[] {
  const isMonthly = noticeDeductionAppliesToBooking({
    stayType: detail.stayType,
    durationMode: detail.durationMode,
  });
  const meterUploaded =
    Boolean(detail.meterPhotoEvidence.fetchable) ||
    Boolean(detail.electricityMeterPhotoUrl) ||
    Boolean(detail.meterPhotoMissing);
  const qrUploaded =
    Boolean(detail.refundQrEvidence.fetchable) ||
    Boolean(detail.payoutQrUrl?.trim()) ||
    Boolean(detail.payoutUpiId?.trim());
  const electricityDone =
    (detail.electricitySharePaise ?? 0) > 0 ||
    detail.amountsLocked ||
    detail.status === 'refund_pending' ||
    detail.status === 'completed' ||
    detail.status === 'refund_paid';
  const refundPaid =
    detail.status === 'completed' ||
    detail.status === 'refund_paid' ||
    Boolean(detail.refundPaidAt);
  const checkoutDone =
    detail.status === 'completed' || detail.status === 'refund_paid' || detail.amountsLocked;

  const items: Omit<JourneyTimelineItem, 'state'>[] = [
    { id: 'move_out', label: 'Move-out requested' },
    ...(isMonthly ? [{ id: 'approved', label: 'Request approved' }] : []),
    { id: 'meter', label: 'Meter photo uploaded' },
    { id: 'qr', label: 'Refund QR uploaded' },
    { id: 'electricity', label: 'Electricity calculated' },
    { id: 'refund_paid', label: 'Refund paid' },
    { id: 'complete', label: 'Checkout completed' },
  ];

  const doneById: Record<string, boolean> = {
    move_out: true,
    approved: detail.status !== 'awaiting_resident_details' || meterUploaded,
    meter: meterUploaded,
    qr: qrUploaded,
    electricity: electricityDone,
    refund_paid: refundPaid || (detail.preview.finalRefundPaise <= 0 && checkoutDone),
    complete: checkoutDone && (refundPaid || detail.preview.finalRefundPaise <= 0),
  };

  let currentAssigned = false;
  return items.map((item) => {
    const done = doneById[item.id] ?? false;
    if (done) return { ...item, state: 'done' as const };
    if (!currentAssigned) {
      currentAssigned = true;
      return { ...item, state: 'current' as const };
    }
    return { ...item, state: 'upcoming' as const };
  });
}

export function wizardStepFromDetail(detail: CheckoutSettlementDetail): 1 | 2 | 3 | 4 {
  if (detail.status === 'awaiting_resident_details') return 1;
  if (detail.status === 'refund_pending') return 4;
  if (detail.status === 'completed' || detail.status === 'refund_paid') return 4;
  if (!hasCheckoutElectricityEvidence(detail) || (detail.electricitySharePaise ?? 0) <= 0) return 2;
  return 3;
}
