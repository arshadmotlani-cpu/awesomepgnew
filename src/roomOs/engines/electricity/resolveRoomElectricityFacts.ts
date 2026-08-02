/**
 * Pure helpers — Room OS Electricity Engine (Wave 1).
 */

import type { ElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';
import type { RoomOsSharedSnapshot } from '@/src/roomOs/types';

export function mapRoomBillingModeToSnapshot(
  billingMode: 'per_bed' | 'private_room' | null | undefined,
): RoomOsSharedSnapshot['billingMode'] {
  if (billingMode === 'per_bed' || billingMode === 'private_room') return 'monthly';
  return 'unknown';
}

export function resolveMeterReadingStateForMonth(input: {
  billingMonth: string;
  billForMonth: { currentReadingUnits: number | null } | null;
  lastBillingMonth: string | null;
  baselineSource: 'last_monthly_bill' | 'last_monthly_meter_log' | 'none';
}): RoomOsSharedSnapshot['meterReadingState'] {
  if (input.billForMonth?.currentReadingUnits != null) return 'current';
  if (input.baselineSource === 'none') return 'missing';
  if (input.lastBillingMonth && input.lastBillingMonth < input.billingMonth) return 'stale';
  if (input.lastBillingMonth === input.billingMonth) return 'current';
  return 'stale';
}

export function resolveElectricityStatusFromLedger(
  ledger: ElectricitySettlementLedgerView | null,
  meterReadingState: RoomOsSharedSnapshot['meterReadingState'],
): { status: string; reason?: string } {
  if (!ledger) {
    if (meterReadingState === 'missing') {
      return { status: 'awaiting_bill', reason: 'missing_meter' };
    }
    if (meterReadingState === 'stale') {
      return { status: 'awaiting_bill', reason: 'meter_reading_stale' };
    }
    return { status: 'awaiting_bill', reason: 'no_bill' };
  }

  if (!ledger.isBalanced || ledger.hasReconciliationWarning) {
    return {
      status: 'blocked',
      reason: ledger.isBalanced ? 'reconciliation_warning' : 'reconciliation_gap',
    };
  }

  if (ledger.isFullyCollected) return { status: 'complete' };

  if (ledger.outstandingPaise > 0) {
    return { status: 'pending_collection', reason: 'outstanding_resident_share' };
  }

  return { status: 'in_progress' };
}
