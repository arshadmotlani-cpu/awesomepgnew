/**
 * Room Brain V2 — resident-facing electricity bill lifecycle status.
 * Pure derivation from room shared facts; no UI inference.
 */

import type { ElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';
import type { NextElectricityBillStatus, RoomOsSharedSnapshot } from '@/src/roomOs/types';

export type ResolveNextElectricityBillStatusInput = {
  meterReadingState: RoomOsSharedSnapshot['meterReadingState'];
  electricityStatus: string;
  hasActiveGenerationJob: boolean;
  ledger: ElectricitySettlementLedgerView | null;
  /** Earliest unpaid electricity invoice due date (YYYY-MM-DD) for this room/month. */
  earliestUnpaidDueDate?: string | null;
  asOf: string;
};

/** True when the room is waiting for admin meter entry — resident must not see ₹0 as "all clear". */
export function isRoomAwaitingElectricityBillGeneration(
  status: NextElectricityBillStatus,
): boolean {
  return status === 'awaiting_meter' || status === 'stale_meter' || status === 'bill_generating';
}

export function resolveNextElectricityBillStatus(
  input: ResolveNextElectricityBillStatusInput,
): NextElectricityBillStatus {
  if (input.hasActiveGenerationJob) {
    return 'bill_generating';
  }

  if (!input.ledger) {
    if (input.meterReadingState === 'missing') return 'awaiting_meter';
    if (input.meterReadingState === 'stale') return 'stale_meter';
    if (input.electricityStatus === 'awaiting_bill') {
      return 'awaiting_meter';
    }
    return 'awaiting_meter';
  }

  if (input.ledger.isFullyCollected) {
    return 'paid';
  }

  if (input.ledger.outstandingPaise > 0) {
    const due = input.earliestUnpaidDueDate;
    if (due && due < input.asOf) {
      return 'overdue';
    }
    return 'bill_ready';
  }

  if (input.electricityStatus === 'complete') {
    return 'paid';
  }

  return 'bill_ready';
}

export function nextElectricityBillStatusLabel(status: NextElectricityBillStatus): string {
  switch (status) {
    case 'awaiting_meter':
      return 'Waiting for monthly meter reading';
    case 'stale_meter':
      return 'Awaiting meter reading';
    case 'bill_generating':
      return 'Electricity bill generating';
    case 'bill_ready':
      return 'Bill ready — payment due';
    case 'paid':
      return 'Paid';
    case 'overdue':
      return 'Overdue';
    default:
      return 'Electricity billing';
  }
}

export function residentElectricityPendingMessage(
  status: NextElectricityBillStatus,
  billingMonthLabel: string,
): string {
  switch (status) {
    case 'awaiting_meter':
    case 'stale_meter':
      return `No electricity bill has been generated yet for ${billingMonthLabel}. The bill will appear once the admin records the room meter.`;
    case 'bill_generating':
      return `Your room's electricity bill for ${billingMonthLabel} is being prepared. It will appear here shortly.`;
    default:
      return '';
  }
}
