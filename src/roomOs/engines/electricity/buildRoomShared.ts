/**
 * Electricity Engine — Room OS shared snapshot from ledger reads (Wave 1 + V2 bill status).
 * Delegates to electricity settlement SSOT + room meter SSOT.
 */

import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityBills, electricityInvoices, floors, rooms } from '@/src/db/schema';
import { getRoomBillingConfig } from '@/src/lib/billing/roomBilling';
import { todayString } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';
import { getActiveElectricityBillGenerationJob } from '@/src/services/electricityBillGenerationJobs';
import { getElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';
import { resolveRoomPreviousMeterReading } from '@/src/services/roomMeterReadingSsot';
import {
  mapRoomBillingModeToSnapshot,
  resolveElectricityStatusFromLedger,
  resolveMeterReadingStateForMonth,
} from '@/src/roomOs/engines/electricity/resolveRoomElectricityFacts';
import { resolveNextElectricityBillStatus } from '@/src/roomOs/engines/electricity/resolveNextElectricityBillStatus';
import type { RoomOsSharedSnapshot } from '@/src/roomOs/types';

/** Live-read Room shared state (truth L1 → L3 on demand). Materialized cache follows via RoomProjector. */
export async function buildRoomSharedSnapshot(input: {
  roomId: string;
  billingMonth: string;
  asOf?: string;
}): Promise<RoomOsSharedSnapshot | null> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const asOf = input.asOf ?? todayString();

  const [roomRow] = await db
    .select({
      roomId: rooms.id,
      pgId: floors.pgId,
    })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(rooms.id, input.roomId))
    .limit(1);

  if (!roomRow) return null;

  const [billRow] = await db
    .select({
      id: electricityBills.id,
      currentReadingUnits: electricityBills.currentReadingUnits,
    })
    .from(electricityBills)
    .where(
      and(
        eq(electricityBills.roomId, input.roomId),
        eq(electricityBills.billingMonth, billingMonth),
        eq(electricityBills.isPipelineTest, false),
      ),
    )
    .limit(1);

  const baseline = await resolveRoomPreviousMeterReading(input.roomId, {
    beforeBillingMonth: billingMonth,
  });
  const roomBilling = await getRoomBillingConfig(input.roomId);

  const meterReadingState = resolveMeterReadingStateForMonth({
    billingMonth,
    billForMonth: billRow
      ? { currentReadingUnits: Number(billRow.currentReadingUnits) }
      : null,
    lastBillingMonth: baseline.lastBillingMonth,
    baselineSource: baseline.source,
  });

  const ledger = billRow
    ? await getElectricitySettlementLedgerView({
        roomId: input.roomId,
        billingMonth,
      })
    : null;

  const { status, reason } = resolveElectricityStatusFromLedger(ledger, meterReadingState);

  const activeJob = await getActiveElectricityBillGenerationJob({
    roomId: input.roomId,
    billingMonth,
  });

  let earliestUnpaidDueDate: string | null = null;
  if (billRow) {
    const unpaidRows = await db
      .select({ dueDate: electricityInvoices.dueDate })
      .from(electricityInvoices)
      .where(
        and(
          eq(electricityInvoices.electricityBillId, billRow.id),
          eq(electricityInvoices.status, 'pending'),
        ),
      )
      .orderBy(asc(electricityInvoices.dueDate))
      .limit(1);
    earliestUnpaidDueDate = unpaidRows[0]?.dueDate ?? null;
  }

  const nextElectricityBillStatus = resolveNextElectricityBillStatus({
    meterReadingState,
    electricityStatus: status,
    hasActiveGenerationJob: activeJob != null,
    ledger,
    earliestUnpaidDueDate,
    asOf,
  });

  const lastReadingUnits =
    billRow != null
      ? Number(billRow.currentReadingUnits)
      : baseline.lastBillingMonth
        ? baseline.previousReadingUnits
        : null;

  return {
    roomId: input.roomId,
    pgId: roomRow.pgId,
    billingMonth,
    asOf,
    billingMode: mapRoomBillingModeToSnapshot(roomBilling?.billingMode),
    meterReadingState,
    electricityStatus: status,
    electricityStatusReason: reason,
    nextElectricityBillStatus,
    lastReadingUnits,
    lastBillMonth: baseline.lastBillingMonth,
    computedAt: new Date().toISOString(),
    snapshotVersion: 2,
    derivationRefs: [
      {
        stepId: 'electricity.meter_baseline',
        engine: 'Electricity',
        inputDigest: `room:${input.roomId}:month:${billingMonth}`,
        outputDigest: meterReadingState,
      },
      {
        stepId: 'electricity.room_status',
        engine: 'Electricity',
        inputDigest: ledger ? `bill:${billRow!.id}` : 'no_bill',
        outputDigest: status,
      },
      {
        stepId: 'electricity.next_bill_status',
        engine: 'Electricity',
        inputDigest: `job:${activeJob?.id ?? 'none'}:ledger:${ledger ? 'yes' : 'no'}`,
        outputDigest: nextElectricityBillStatus,
      },
    ],
  };
}
