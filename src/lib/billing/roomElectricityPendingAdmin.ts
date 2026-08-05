/**
 * Admin room electricity pending view — Room Brain V2 SSOT for room warnings.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { firstOfMonth, monthBounds } from '@/src/services/billing';
import { listRoomsMissingElectricityBill } from '@/src/services/electricityBilling';
import { resolveRoomPreviousMeterReading } from '@/src/services/roomMeterReadingSsot';
import { loadRoomShared } from '@/src/roomOs/api/v1/roomOs';
import { isRoomAwaitingElectricityBillGeneration } from '@/src/roomOs/engines/electricity/resolveNextElectricityBillStatus';
import type { NextElectricityBillStatus } from '@/src/roomOs/types';
import { formatDate } from '@/src/lib/format';

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

    const { start: monthStart, end: monthEnd } = monthBounds(billingMonth);
    const monthStartIso = formatDate(monthStart);
    const monthEndIso = formatDate(monthEnd);

    const occupants = await db.execute<{
      full_name: string;
      booking_code: string;
      bed_code: string;
    }>(sql`
      SELECT DISTINCT c.full_name, b.booking_code, bd.bed_code
      FROM bed_reservations br
      INNER JOIN beds bd ON bd.id = br.bed_id
      INNER JOIN bookings b ON b.id = br.booking_id
      INNER JOIN customers c ON c.id = b.customer_id
      WHERE bd.room_id = ${room.roomId}::uuid
        AND br.status = 'active'
        AND b.status = 'confirmed'
        AND b.duration_mode IN ('monthly', 'open_ended')
        AND br.stay_range && daterange(${monthStartIso}::date, ${monthEndIso}::date, '[)')
      ORDER BY c.full_name
    `);

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
      affectedResidents: occupants.map((o) => ({
        name: o.full_name,
        bookingCode: o.booking_code,
        bedCode: o.bed_code,
      })),
      generateHref: `/admin/billing/electricity/generate?month=${monthKey}&wizard=1&pgId=${room.pgId}&roomId=${room.roomId}`,
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
