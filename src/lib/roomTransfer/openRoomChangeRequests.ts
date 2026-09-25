import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { beds, bookings, roomChangeRequests, rooms } from '@/src/db/schema';
import { isRoomChangeTerminal } from '@/src/lib/roomTransfer/stateMachine';

export type OpenRoomChangeRequestRow = {
  id: string;
  bookingId: string;
  status: string;
  workflowState: string;
  expectedTransferDate: string | null;
  requestedShiftDate: string;
  transferMode: 'immediate' | 'scheduled' | null;
  toRoomNumber: string;
  toBedCode: string;
  createdAt: Date;
};

/** Non-terminal self-service room change rows for resident portal / requests tab. */
export async function listOpenRoomChangeRequestsForCustomer(
  customerId: string,
): Promise<OpenRoomChangeRequestRow[]> {
  const rows = await db
    .select({
      id: roomChangeRequests.id,
      bookingId: roomChangeRequests.bookingId,
      status: roomChangeRequests.status,
      workflowState: roomChangeRequests.workflowState,
      expectedTransferDate: roomChangeRequests.expectedTransferDate,
      requestedShiftDate: roomChangeRequests.requestedShiftDate,
      transferMode: roomChangeRequests.transferMode,
      toRoomNumber: rooms.roomNumber,
      toBedCode: beds.bedCode,
      createdAt: roomChangeRequests.createdAt,
    })
    .from(roomChangeRequests)
    .innerJoin(beds, eq(beds.id, roomChangeRequests.toBedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(
      and(
        eq(roomChangeRequests.customerId, customerId),
        sql`${roomChangeRequests.workflowState} NOT IN ('COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED')`,
      ),
    )
    .orderBy(roomChangeRequests.createdAt);

  return rows.filter((row) => !isRoomChangeTerminal(row.workflowState as never));
}

export function openRoomChangeStatusLabel(
  workflowState: string,
  transferMode: 'immediate' | 'scheduled' | null,
): string {
  if (workflowState === 'READY_TO_TRANSFER' || workflowState === 'TRANSFERRING') {
    return transferMode === 'scheduled' ? 'scheduled_transfer' : 'ready_to_transfer';
  }
  if (workflowState === 'PAYMENT_PENDING') return 'payment_pending';
  return workflowState.toLowerCase();
}
