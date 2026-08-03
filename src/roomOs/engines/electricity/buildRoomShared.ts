/**
 * Electricity Engine — Room OS shared snapshot from ledger reads (Wave 1).
 * Delegates to electricity settlement SSOT + room meter SSOT.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityBills, floors, rooms } from '@/src/db/schema';
import { getRoomBillingConfig } from '@/src/lib/billing/roomBilling';
import { todayString } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';
import { getElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';
import { resolveRoomPreviousMeterReading } from '@/src/services/roomMeterReadingSsot';
import {
  mapRoomBillingModeToSnapshot,
  resolveElectricityStatusFromLedger,
  resolveMeterReadingStateForMonth,
} from '@/src/roomOs/engines/electricity/resolveRoomElectricityFacts';
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

  return {
    roomId: input.roomId,
    pgId: roomRow.pgId,
    billingMonth,
    asOf,
    billingMode: mapRoomBillingModeToSnapshot(roomBilling?.billingMode),
    meterReadingState,
    electricityStatus: status,
    electricityStatusReason: reason,
    computedAt: new Date().toISOString(),
    snapshotVersion: 1,
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
    ],
  };
}
