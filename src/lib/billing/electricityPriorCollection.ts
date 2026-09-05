/**
 * Prior electricity collection per customer + room + consumption month.
 */
import type { ElectricityInvoice } from '@/src/db/schema/electricityInvoices';
import { firstOfMonth } from '@/src/services/billing';
import { loadRoomElectricityContributionsForMonth } from '@/src/services/electricityRoomContributions';

export function roomMonthCollectionKey(roomId: string, billingMonth: string): string {
  return `${roomId}:${firstOfMonth(billingMonth)}`;
}

export async function loadPriorElectricityCollectionForCustomer(
  customerId: string,
  invoices: Array<{ roomId: string; billingMonth: string }>,
): Promise<Map<string, number>> {
  const keys = new Map<string, { roomId: string; billingMonth: string }>();
  for (const inv of invoices) {
    const month = firstOfMonth(inv.billingMonth);
    keys.set(roomMonthCollectionKey(inv.roomId, month), { roomId: inv.roomId, billingMonth: month });
  }
  const result = new Map<string, number>();
  for (const { roomId, billingMonth } of keys.values()) {
    const load = await loadRoomElectricityContributionsForMonth(roomId, billingMonth);
    const amount = load.byCustomerId.get(customerId) ?? 0;
    if (amount > 0) result.set(roomMonthCollectionKey(roomId, billingMonth), amount);
  }
  return result;
}

export async function loadPriorElectricityCollectionByBooking(
  customerId: string,
  detail: Array<{
    bookingId: string;
    electricity: { ok: boolean; data: Array<{ roomId?: string | null; billingMonth: string }> };
  }>,
): Promise<Map<string, Map<string, number>>> {
  const byBooking = new Map<string, Map<string, number>>();
  for (const d of detail) {
    const rows = d.electricity.ok
      ? d.electricity.data.filter((r) => r.roomId)
      : [];
    if (rows.length === 0) continue;
    byBooking.set(
      d.bookingId,
      await loadPriorElectricityCollectionForCustomer(
        customerId,
        rows.map((r) => ({ roomId: r.roomId!, billingMonth: r.billingMonth })),
      ),
    );
  }
  return byBooking;
}
