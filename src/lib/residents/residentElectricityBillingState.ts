/**
 * Resident electricity billing state — Room Brain V2 SSOT for portal UX.
 * Combines room shared snapshot + booking ledger; UI must not infer status.
 */
import { formatDate } from '@/src/lib/format';
import { firstOfMonth } from '@/src/services/billing';
import { loadLedger, loadRoomShared } from '@/src/roomOs/api/v1/roomOs';
import {
  isRoomAwaitingElectricityBillGeneration,
  nextElectricityBillStatusLabel,
  residentElectricityPendingMessage,
} from '@/src/roomOs/engines/electricity/resolveNextElectricityBillStatus';
import type { NextElectricityBillStatus } from '@/src/roomOs/types';

export type ResidentElectricityBillingState = {
  status: NextElectricityBillStatus;
  billingMonth: string;
  billingMonthLabel: string;
  statusLabel: string;
  message: string;
  /** Show pending card (no pay button) instead of ₹0 due. */
  showPendingCard: boolean;
};

function billingMonthDisplayLabel(billingMonth: string): string {
  const d = new Date(`${billingMonth.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/**
 * Load resident-scoped electricity billing state for the active billing month.
 * Returns null when room snapshot unavailable (non-AC / no room).
 */
export async function loadResidentElectricityBillingState(input: {
  roomId: string;
  bookingId: string;
  billingMonth?: string;
  asOf?: string;
}): Promise<ResidentElectricityBillingState | null> {
  const billingMonth = firstOfMonth(input.billingMonth ?? new Date());
  const shared = await loadRoomShared({
    roomId: input.roomId,
    billingMonth,
    asOf: input.asOf,
  });
  if (!shared.snapshot) return null;

  const ledger = await loadLedger({ bookingId: input.bookingId, asOf: input.asOf });
  const roomStatus = shared.snapshot.nextElectricityBillStatus;
  const residentElecOutstanding = ledger.snapshot?.electricity.outstandingPaise ?? 0;

  const billingMonthLabel = billingMonthDisplayLabel(billingMonth);

  // Resident has an unpaid invoice — due rows handle display; no pending card.
  if (residentElecOutstanding > 0) {
    const status: NextElectricityBillStatus =
      roomStatus === 'overdue' ? 'overdue' : 'bill_ready';
    return {
      status,
      billingMonth,
      billingMonthLabel,
      statusLabel: nextElectricityBillStatusLabel(status),
      message: '',
      showPendingCard: false,
    };
  }

  // Room waiting for bill generation — show pending, not ₹0.
  if (isRoomAwaitingElectricityBillGeneration(roomStatus)) {
    return {
      status: roomStatus,
      billingMonth,
      billingMonthLabel,
      statusLabel: nextElectricityBillStatusLabel(roomStatus),
      message: residentElectricityPendingMessage(roomStatus, billingMonthLabel),
      showPendingCard: true,
    };
  }

  if (roomStatus === 'paid' || shared.snapshot.electricityStatus === 'complete') {
    return {
      status: 'paid',
      billingMonth,
      billingMonthLabel,
      statusLabel: nextElectricityBillStatusLabel('paid'),
      message: '',
      showPendingCard: false,
    };
  }

  return {
    status: roomStatus,
    billingMonth,
    billingMonthLabel,
    statusLabel: nextElectricityBillStatusLabel(roomStatus),
    message: '',
    showPendingCard: false,
  };
}

/** Format helper for tests. */
export { billingMonthDisplayLabel };
