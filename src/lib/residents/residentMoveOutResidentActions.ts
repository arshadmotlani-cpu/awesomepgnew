import type { CheckoutSettlementStatus } from '@/src/db/schema/enums';
import type { ExitChecklistItem } from '@/src/lib/exit/exitBrainChecklist';

export type ResidentMoveOutActionItem = {
  id: string;
  label: string;
  done: boolean;
};

export function buildResidentMoveOutResidentActions(input: {
  vacatingStatus: string | null;
  pendingDateChangeRequestId?: string | null;
  checkoutStatus?: CheckoutSettlementStatus | string | null;
  checklist?: ExitChecklistItem[];
  hasPayoutDetails?: boolean;
}): ResidentMoveOutActionItem[] {
  const checklist = input.checklist ?? [];
  const find = (id: ExitChecklistItem['id']) => checklist.find((c) => c.id === id);

  const approved =
    input.vacatingStatus === 'approved' || input.vacatingStatus === 'completed';
  const finalStayConfirmed =
    approved && !input.pendingDateChangeRequestId;

  const meterDone = find('upload_meter_photo')?.status === 'done';
  const inspectionDone = find('room_inspection')?.status === 'done';

  const payoutDone =
    input.hasPayoutDetails ||
    input.checkoutStatus != null &&
      input.checkoutStatus !== 'awaiting_resident_details' &&
      input.checkoutStatus !== 'archived';

  return [
    {
      id: 'final_stay_date',
      label: 'Submit or confirm your final stay date',
      done: finalStayConfirmed,
    },
    {
      id: 'meter_photo',
      label: 'Upload final AC meter photo',
      done: meterDone,
    },
    {
      id: 'room_inspection',
      label: 'Complete room inspection / handover',
      done: inspectionDone,
    },
    {
      id: 'refund_details',
      label: 'Provide refund payment details if required',
      done: payoutDone,
    },
  ];
}
