/**
 * Fleet-wide electricity billing status — derived from PG room inventory checklists.
 * Never derives room lists from active reservations or existing bills alone.
 */
import {
  listActivePgsForElectricityBilling,
  loadPgElectricityBillingChecklist,
  type PgElectricityBillingChecklist,
  type PgElectricityChecklistRoom,
} from '@/src/lib/billing/pgElectricityBillingChecklist';
import { firstOfMonth } from '@/src/services/billing';

export type FleetElectricityBillingSummary = {
  billingMonth: string;
  pgCount: number;
  totalRooms: number;
  alreadyBilled: number;
  needMeterReading: number;
  needBill: number;
  maintenanceExcluded: number;
  notEligible: number;
  previousUnavailable: number;
  checklists: PgElectricityBillingChecklist[];
};

export type FleetRoomMissingElectricityRow = {
  roomId: string;
  roomNumber: string;
  pgId: string;
  pgName: string;
  status: PgElectricityChecklistRoom['status'];
};

export async function loadFleetElectricityBillingSummary(
  billingMonthInput: string,
): Promise<FleetElectricityBillingSummary> {
  const billingMonth = firstOfMonth(billingMonthInput);
  const pgs = await listActivePgsForElectricityBilling();
  const checklists: PgElectricityBillingChecklist[] = [];

  for (const pg of pgs) {
    const checklist = await loadPgElectricityBillingChecklist({
      pgId: pg.id,
      billingMonth,
    });
    if (checklist) checklists.push(checklist);
  }

  const rooms = checklists.flatMap((c) => c.rooms);
  return {
    billingMonth,
    pgCount: checklists.length,
    totalRooms: rooms.length,
    alreadyBilled: rooms.filter((r) => r.status === 'already_billed').length,
    needMeterReading: rooms.filter((r) => r.status === 'reading_required').length,
    needBill: rooms.filter(
      (r) => r.status === 'reading_required' || r.status === 'previous_unavailable',
    ).length,
    maintenanceExcluded: rooms.filter((r) => r.status === 'maintenance_excluded').length,
    notEligible: rooms.filter((r) => r.status === 'not_eligible').length,
    previousUnavailable: rooms.filter((r) => r.status === 'previous_unavailable').length,
    checklists,
  };
}

/** Rooms without a September bill that are billable (excludes maintenance + no-liability). */
export async function listFleetRoomsMissingElectricityBill(
  billingMonthInput: string,
): Promise<FleetRoomMissingElectricityRow[]> {
  const fleet = await loadFleetElectricityBillingSummary(billingMonthInput);
  const rows: FleetRoomMissingElectricityRow[] = [];
  for (const checklist of fleet.checklists) {
    for (const room of checklist.rooms) {
      if (
        room.status === 'reading_required' ||
        room.status === 'previous_unavailable'
      ) {
        rows.push({
          roomId: room.roomId,
          roomNumber: room.roomNumber,
          pgId: checklist.pgId,
          pgName: checklist.pgName,
          status: room.status,
        });
      }
    }
  }
  return rows.sort((a, b) =>
    a.pgName.localeCompare(b.pgName) || a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }),
  );
}

/** Billable rooms that need a current meter reading before generation. */
export async function countFleetRoomsNeedingMeterReading(
  billingMonthInput: string,
): Promise<number> {
  const fleet = await loadFleetElectricityBillingSummary(billingMonthInput);
  return fleet.needMeterReading;
}
