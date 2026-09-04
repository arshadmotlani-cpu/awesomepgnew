/**
 * Admin room electricity pending view — Room Brain V2 SSOT for room warnings.
 */
import { firstOfMonth } from '@/src/services/billing';
import { listRoomsMissingElectricityBill } from '@/src/services/electricityBilling';
import { resolveRoomPreviousMeterReading } from '@/src/services/roomMeterReadingSsot';
import { loadRoomElectricityOccupantsForMonth } from '@/src/lib/billing/roomElectricityOccupants';
import { loadRoomShared } from '@/src/roomOs/api/v1/roomOs';
import { isRoomAwaitingElectricityBillGeneration } from '@/src/roomOs/engines/electricity/resolveNextElectricityBillStatus';
import type { NextElectricityBillStatus } from '@/src/roomOs/types';

export type RoomElectricityPendingAdminRow = {
  roomId: string;
  roomNumber: string;
  pgId: string;
  pgName: string;
  billingMonth: string;
  billingMonthLabel: string;
  nextElectricityBillStatus: NextElectricityBillStatus;
  lastReadingUnits: number | null;
  lastBillMonth: string | null;
  lastBillMonthLabel: string | null;
  affectedResidents: Array<{ name: string; bookingCode: string; bedCode: string }>;
  generateHref: string;
};

export async function loadRoomElectricityPendingForPg(input: {
  pgId: string;
  billingMonth?: string;
}): Promise<RoomElectricityPendingAdminRow[]> {
  const billingMonth = firstOfMonth(input.billingMonth ?? new Date());
  const monthKey = billingMonth.slice(0, 7);
  const missing = await listRoomsMissingElectricityBill(billingMonth);
  const pgRooms = missing.filter((r) => r.pgId === input.pgId);
  if (pgRooms.length === 0) return [];

  const rows: RoomElectricityPendingAdminRow[] = [];

  for (const room of pgRooms) {
    const shared = await loadRoomShared({ roomId: room.roomId, billingMonth });
    const status = shared.snapshot?.nextElectricityBillStatus ?? 'awaiting_meter';
    if (!isRoomAwaitingElectricityBillGeneration(status)) continue;

    const baseline = await resolveRoomPreviousMeterReading(room.roomId, {
      beforeBillingMonth: billingMonth,
    });

    const occupantLoad = await loadRoomElectricityOccupantsForMonth({
      roomId: room.roomId,
      billingMonth,
      includeFixedStay: true,
      useProRataByActiveDays: true,
    });

    rows.push({
      roomId: room.roomId,
      roomNumber: room.roomNumber,
      pgId: room.pgId,
      pgName: room.pgName,
      billingMonth,
      billingMonthLabel: new Date(`${billingMonth}T12:00:00`).toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
      }),
      nextElectricityBillStatus: status,
      lastReadingUnits: baseline.previousReadingUnits,
      lastBillMonth: baseline.lastBillingMonth,
      lastBillMonthLabel: baseline.lastBillingMonth
        ? new Date(`${baseline.lastBillingMonth}T12:00:00`).toLocaleDateString('en-IN', {
            month: 'long',
            year: 'numeric',
          })
        : null,
      affectedResidents: occupantLoad.occupants.map((o) => ({
        name: o.customerName ?? 'Resident',
        bookingCode: o.bookingCode ?? o.bookingId,
        bedCode: o.bedIds[0] ?? '—',
      })),
      generateHref: `/admin/billing/electricity/generate?month=${monthKey}&pgId=${room.pgId}`,
    });
  }

  return rows.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
}

export async function countRoomsAwaitingElectricityBilling(
  billingMonth?: string,
): Promise<number> {
  const month = firstOfMonth(billingMonth ?? new Date());
  const missing = await listRoomsMissingElectricityBill(month);
  let count = 0;
  for (const room of missing) {
    const shared = await loadRoomShared({ roomId: room.roomId, billingMonth: month });
    const status = shared.snapshot?.nextElectricityBillStatus ?? 'awaiting_meter';
    if (isRoomAwaitingElectricityBillGeneration(status)) count += 1;
  }
  return count;
}
