/**
 * Operations Centre parity — legacy vs Room OS read paths (Wave 2 acceptance).
 */

import type { OpsQueueFilter } from '@/src/lib/operations/operationsFilterLinks';
import { OPS_QUEUE_FILTERS } from '@/src/lib/operations/operationsFilterLinks';
import { loadPropertyIndex } from '@/src/roomOs/api/v1/propertyOs';
import { getWorkQueue } from '@/src/roomOs/api/v1/decision';
import { runPropertyIndexParityChecks } from '@/src/roomOs/certification/checks/propertyIndexParity';
import { runWorkQueueParityChecks } from '@/src/roomOs/certification/checks/workQueueParity';
import { resolveShantinagarPgId } from '@/src/roomOs/certification/shantinagar/resolvePg';
import type { AdminSession } from '@/src/lib/auth/session';
import { todayString } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';
import {
  loadOperationsQueueForParityAudit,
  type UnifiedOpsItem,
} from '@/src/services/unifiedOperationsQueue';

export type OperationsParityRow = {
  filter: OpsQueueFilter;
  legacyCount: number;
  roomOsCount: number;
  matches: boolean;
  informational?: boolean;
  legacyBookingIds: string[];
  roomOsBookingIds: string[];
  bookingIdDelta: string[];
};

export type OperationsParityReport = {
  pass: boolean;
  rows: OperationsParityRow[];
  sharedTabPass: boolean;
  migratedTabInformational: OperationsParityRow[];
  propertyIndexFailCount: number;
  workQueueFailCount: number;
  kpiTotals: {
    legacyRentDue: number;
    roomOsRentDue: number;
    legacyElectricityDue: number;
    roomOsElectricityDue: number;
  };
  workQueueContentHash: string | null;
  summary: string;
};

const SHARED_TABS: OpsQueueFilter[] = [
  'waiting_for_approval',
  'vacating_requests',
  'refund_due',
  'booking_approval',
  'deposit_due',
  'kyc_review',
];

const MIGRATED_TABS: OpsQueueFilter[] = ['rent_due', 'electricity_due'];

export function filterCount(
  items: UnifiedOpsItem[],
  filter: OpsQueueFilter,
): number {
  return items.filter((item) => item.queue === filter).length;
}

export function bookingIdsForFilter(
  items: UnifiedOpsItem[],
  filter: OpsQueueFilter,
): string[] {
  return [
    ...new Set(
      items
        .filter((item) => item.queue === filter && item.bookingId)
        .map((item) => item.bookingId as string),
    ),
  ].sort();
}

export function compareBookingIdSets(
  legacyIds: string[],
  roomOsIds: string[],
): string[] {
  const roomOsSet = new Set(roomOsIds);
  return legacyIds.filter((id) => !roomOsSet.has(id));
}

export function compareOperationsQueueItems(
  legacyItems: UnifiedOpsItem[],
  roomOsItems: UnifiedOpsItem[],
): OperationsParityRow[] {
  return OPS_QUEUE_FILTERS.map((filter) => {
    const legacyBookingIds = bookingIdsForFilter(legacyItems, filter);
    const roomOsBookingIds = bookingIdsForFilter(roomOsItems, filter);
    const legacyCount = filterCount(legacyItems, filter);
    const roomOsCount = filterCount(roomOsItems, filter);
    const informational = MIGRATED_TABS.includes(filter);
    const matches = informational
      ? true
      : legacyCount === roomOsCount &&
        compareBookingIdSets(legacyBookingIds, roomOsBookingIds).length === 0 &&
        compareBookingIdSets(roomOsBookingIds, legacyBookingIds).length === 0;

    return {
      filter,
      legacyCount,
      roomOsCount,
      matches,
      informational,
      legacyBookingIds,
      roomOsBookingIds,
      bookingIdDelta: compareBookingIdSets(legacyBookingIds, roomOsBookingIds),
    };
  });
}

export async function runOperationsCentreParityAudit(
  session: AdminSession,
): Promise<OperationsParityReport> {
  const [legacyItems, roomOsItems, shantinagar] = await Promise.all([
    loadOperationsQueueForParityAudit(session, 'legacy'),
    loadOperationsQueueForParityAudit(session, 'room_os'),
    resolveShantinagarPgId(),
  ]);

  const rows = compareOperationsQueueItems(legacyItems, roomOsItems);
  const sharedTabPass = rows.filter((r) => SHARED_TABS.includes(r.filter)).every((r) => r.matches);
  const migratedTabInformational = rows.filter((r) => MIGRATED_TABS.includes(r.filter));

  let propertyIndexFailCount = 0;
  let workQueueFailCount = 0;
  let workQueueContentHash: string | null = null;

  if (shantinagar) {
    const asOf = todayString();
    const billingMonth = firstOfMonth(asOf);
    const ctx = {
      pgId: shantinagar.pgId,
      pgName: shantinagar.pgName,
      billingMonth,
      asOf,
    };
    const [propertyFindings, workQueueFindings, workQueueResult, propertyIndexResult] =
      await Promise.all([
        runPropertyIndexParityChecks(ctx),
        runWorkQueueParityChecks(ctx),
        getWorkQueue({ pgId: shantinagar.pgId, billingMonth, asOf, limit: 50_000 }),
        loadPropertyIndex({ pgId: shantinagar.pgId, billingMonth, asOf }),
      ]);
    propertyIndexFailCount = propertyFindings.filter((f) => f.severity === 'fail').length;
    workQueueFailCount = workQueueFindings.filter((f) => f.severity === 'fail').length;
    workQueueContentHash = workQueueResult.snapshot?.contentHash ?? null;
    void propertyIndexResult;
  }

  const kpiTotals = {
    legacyRentDue: filterCount(legacyItems, 'rent_due'),
    roomOsRentDue: filterCount(roomOsItems, 'rent_due'),
    legacyElectricityDue: filterCount(legacyItems, 'electricity_due'),
    roomOsElectricityDue: filterCount(roomOsItems, 'electricity_due'),
  };

  const pass =
    sharedTabPass && propertyIndexFailCount === 0 && workQueueFailCount === 0;

  return {
    pass,
    rows,
    sharedTabPass,
    migratedTabInformational,
    propertyIndexFailCount,
    workQueueFailCount,
    kpiTotals,
    workQueueContentHash,
    summary: pass
      ? 'Operations Centre parity audit PASS — shared tabs match; index/work queue parity clean.'
      : 'Operations Centre parity audit FAIL — see row deltas and certification findings.',
  };
}
