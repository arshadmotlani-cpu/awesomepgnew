/**
 * Resident Exit Brain — shared move-out checklist (resident + admin).
 */
import type { CheckoutSettlementStatus } from '@/src/db/schema/enums';

export type ExitChecklistItemId =
  | 'notice_approved'
  | 'room_inspection'
  | 'upload_meter_photo'
  | 'return_key'
  | 'electricity_calculated'
  | 'deposit_approved'
  | 'refund_sent';

export type ExitChecklistItemStatus = 'done' | 'pending' | 'blocked';

export type ExitChecklistItem = {
  id: ExitChecklistItemId;
  label: string;
  status: ExitChecklistItemStatus;
  hint?: string;
};

export type ExitChecklistInput = {
  vacatingStatus: 'pending' | 'approved' | 'completed' | 'rejected' | null;
  settlementStatus: CheckoutSettlementStatus | null;
  hasMeterPhoto: boolean;
  meterPhotoMissing: boolean;
  electricitySharePaise: number | null;
  electricityEstimatedPending: boolean;
  refundPaidAt: string | Date | null;
  hasPayoutDetails: boolean;
};

const CHECKLIST_LABELS: Record<ExitChecklistItemId, string> = {
  notice_approved: 'Notice approved',
  room_inspection: 'Room inspection',
  upload_meter_photo: 'Upload meter photo',
  return_key: 'Return key',
  electricity_calculated: 'Electricity calculated',
  deposit_approved: 'Deposit approved',
  refund_sent: 'Refund sent',
};

export function buildExitBrainChecklist(input: ExitChecklistInput): ExitChecklistItem[] {
  const noticeApproved =
    input.vacatingStatus === 'approved' || input.vacatingStatus === 'completed';
  const meterDone = input.hasMeterPhoto && !input.meterPhotoMissing;
  const electricityDone =
    (input.electricitySharePaise != null && input.electricitySharePaise >= 0) &&
    !input.electricityEstimatedPending;
  const depositApproved =
    input.settlementStatus === 'refund_pending' ||
    input.settlementStatus === 'refund_paid' ||
    input.settlementStatus === 'completed' ||
    input.settlementStatus === 'approved';
  const refundSent = input.refundPaidAt != null || input.settlementStatus === 'refund_paid';

  const roomInspectionDone =
    input.settlementStatus != null &&
    input.settlementStatus !== 'awaiting_resident_details' &&
    noticeApproved;

  const returnKeyDone = roomInspectionDone && meterDone;

  function item(id: ExitChecklistItemId, done: boolean, blocked = false, hint?: string): ExitChecklistItem {
    return {
      id,
      label: CHECKLIST_LABELS[id],
      status: blocked ? 'blocked' : done ? 'done' : 'pending',
      hint,
    };
  }

  if (!input.vacatingStatus || input.vacatingStatus === 'rejected') {
    return Object.keys(CHECKLIST_LABELS).map((id) =>
      item(id as ExitChecklistItemId, false, true, 'No active move-out'),
    );
  }

  return [
    item('notice_approved', noticeApproved, input.vacatingStatus === 'pending'),
    item(
      'room_inspection',
      roomInspectionDone,
      input.vacatingStatus === 'pending',
      roomInspectionDone ? undefined : 'Pending admin or resident checkout steps',
    ),
    item(
      'upload_meter_photo',
      meterDone,
      !noticeApproved,
      meterDone ? undefined : 'Checkout AC meter photo required',
    ),
    item(
      'return_key',
      returnKeyDone,
      !noticeApproved,
      'Confirm key return during room inspection',
    ),
    item(
      'electricity_calculated',
      electricityDone,
      !meterDone,
      input.electricityEstimatedPending ? 'Estimate may change until meter verified' : undefined,
    ),
    item(
      'deposit_approved',
      depositApproved,
      !electricityDone && !depositApproved,
    ),
    item('refund_sent', refundSent, !depositApproved),
  ];
}
