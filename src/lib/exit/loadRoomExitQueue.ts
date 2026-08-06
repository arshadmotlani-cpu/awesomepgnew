/**
 * Room Brain — per-room leaving-soon queue from Exit Brain + vacating.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  checkoutSettlements,
  customers,
  floors,
  pgs,
  residentExitBrain,
  rooms,
  vacatingRequests,
} from '@/src/db/schema';
import type { CheckoutSettlementStatus } from '@/src/db/schema/enums';
import type { ExitBrainLifecycleState } from '@/src/lib/exit/exitBrainStateMachine';
import {
  buildExitBrainLifecycle,
  exitBrainLifecycleStateLabel,
  projectionInputToStateMachineInput,
} from '@/src/lib/exit/exitBrainStateMachine';

export type RoomExitQueueItem = {
  bookingId: string;
  customerName: string;
  expectedCheckoutDate: string;
  lifecycleState: ExitBrainLifecycleState;
  lifecycleLabel: string;
};

export type RoomExitQueuesByRoomId = Record<string, RoomExitQueueItem[]>;

type SettlementSummary = {
  status: CheckoutSettlementStatus | null;
  hasMeterPhoto: boolean;
  meterPhotoMissing: boolean;
  electricitySharePaise: number | null;
  hasPayoutDetails: boolean;
  refundPaidAt: Date | null;
};

function buildQueuesFromRows(
  rows: Array<{
    roomId: string;
    bookingId: string;
    expectedCheckoutDate: string;
    customerFirstName: string | null;
    customerLastName: string | null;
    vacatingStatus: 'pending' | 'approved' | 'completed' | 'rejected';
  }>,
  settlementByBooking: Map<string, SettlementSummary>,
): RoomExitQueuesByRoomId {
  const byRoom: RoomExitQueuesByRoomId = {};

  for (const row of rows) {
    const settlement = settlementByBooking.get(row.bookingId);
    const hasMeterPhoto = settlement?.hasMeterPhoto ?? false;
    const electricityEstimatedPending =
      !settlement?.electricitySharePaise || settlement.electricitySharePaise <= 0;

    const lifecycle = buildExitBrainLifecycle(
      projectionInputToStateMachineInput(
        {
          vacatingStatus: row.vacatingStatus,
          exitBrainStatus: 'active',
          settlementStatus: settlement?.status ?? null,
          hasMeterPhoto,
          meterPhotoMissing: settlement?.meterPhotoMissing ?? false,
          electricitySharePaise: settlement?.electricitySharePaise ?? null,
          electricityEstimatedPending,
          refundPaidAt: settlement?.refundPaidAt ?? null,
          hasPayoutDetails: settlement?.hasPayoutDetails ?? false,
        },
        { hasSettlement: settlement != null },
      ),
    );

    const name =
      [row.customerFirstName, row.customerLastName].filter(Boolean).join(' ').trim() || 'Resident';
    const item: RoomExitQueueItem = {
      bookingId: row.bookingId,
      customerName: name,
      expectedCheckoutDate: String(row.expectedCheckoutDate),
      lifecycleState: lifecycle.state,
      lifecycleLabel: exitBrainLifecycleStateLabel(lifecycle.state),
    };

    const list = byRoom[row.roomId] ?? [];
    list.push(item);
    byRoom[row.roomId] = list;
  }

  for (const roomId of Object.keys(byRoom)) {
    byRoom[roomId]!.sort((a, b) => a.expectedCheckoutDate.localeCompare(b.expectedCheckoutDate));
  }

  return byRoom;
}

async function loadSettlementMap(bookingIds: string[]): Promise<Map<string, SettlementSummary>> {
  const map = new Map<string, SettlementSummary>();
  if (bookingIds.length === 0) return map;

  const settlements = await db
    .select({
      bookingId: checkoutSettlements.bookingId,
      status: checkoutSettlements.status,
      electricityMeterPhotoUrl: checkoutSettlements.electricityMeterPhotoUrl,
      meterPhotoMissing: checkoutSettlements.meterPhotoMissing,
      electricitySharePaise: checkoutSettlements.electricitySharePaise,
      payoutUpiId: checkoutSettlements.payoutUpiId,
      payoutQrUrl: checkoutSettlements.payoutQrUrl,
      refundPaidAt: checkoutSettlements.refundPaidAt,
    })
    .from(checkoutSettlements)
    .where(
      and(
        inArray(checkoutSettlements.bookingId, bookingIds),
        sql`${checkoutSettlements.status} <> 'archived'`,
      ),
    )
    .orderBy(sql`${checkoutSettlements.updatedAt} DESC`);

  for (const s of settlements) {
    if (map.has(s.bookingId)) continue;
    map.set(s.bookingId, {
      status: s.status,
      hasMeterPhoto: Boolean(s.electricityMeterPhotoUrl?.trim()),
      meterPhotoMissing: s.meterPhotoMissing,
      electricitySharePaise: s.electricitySharePaise,
      hasPayoutDetails: Boolean(s.payoutUpiId?.trim() || s.payoutQrUrl?.trim()),
      refundPaidAt: s.refundPaidAt,
    });
  }

  return map;
}

export async function loadRoomExitQueueForRoom(roomId: string): Promise<RoomExitQueueItem[]> {
  const rows = await db
    .select({
      roomId: residentExitBrain.roomId,
      bookingId: residentExitBrain.bookingId,
      expectedCheckoutDate: residentExitBrain.expectedCheckoutDate,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      vacatingStatus: vacatingRequests.status,
    })
    .from(residentExitBrain)
    .innerJoin(customers, eq(customers.id, residentExitBrain.customerId))
    .innerJoin(vacatingRequests, eq(vacatingRequests.id, residentExitBrain.vacatingRequestId))
    .where(and(eq(residentExitBrain.roomId, roomId), eq(residentExitBrain.status, 'active')));

  const settlementByBooking = await loadSettlementMap(rows.map((r) => r.bookingId));
  const queues = buildQueuesFromRows(rows, settlementByBooking);
  return queues[roomId] ?? [];
}

export async function loadRoomExitQueuesForPg(pgId: string): Promise<RoomExitQueuesByRoomId> {
  const rows = await db
    .select({
      roomId: residentExitBrain.roomId,
      bookingId: residentExitBrain.bookingId,
      expectedCheckoutDate: residentExitBrain.expectedCheckoutDate,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      vacatingStatus: vacatingRequests.status,
    })
    .from(residentExitBrain)
    .innerJoin(customers, eq(customers.id, residentExitBrain.customerId))
    .innerJoin(rooms, eq(rooms.id, residentExitBrain.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .innerJoin(vacatingRequests, eq(vacatingRequests.id, residentExitBrain.vacatingRequestId))
    .where(and(eq(pgs.id, pgId), eq(residentExitBrain.status, 'active')));

  const settlementByBooking = await loadSettlementMap(rows.map((r) => r.bookingId));
  return buildQueuesFromRows(rows, settlementByBooking);
}
