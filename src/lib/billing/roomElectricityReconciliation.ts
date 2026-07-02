/**
 * Room-month electricity occupant vs invoice reconciliation with explicit exclusion reasons.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  customers,
  electricityBills,
  electricityInvoices,
  rooms,
} from '@/src/db/schema';
import {
  loadRoomElectricityOccupantsForMonth,
  type RoomElectricityOccupantRow,
} from '@/src/lib/billing/roomElectricityOccupants';
import { isMonthlyElectricityBillableOccupant } from '@/src/lib/billing/electricityOccupancyEligibility';

export type ElectricityOccupantExclusionReason =
  | 'checkout_settled'
  | 'checkout_collected'
  | 'non_billable_status'
  | 'test_record'
  | 'no_month_overlap'
  | 'not_in_allocation';

export type ElectricityOccupantTrace = {
  customerId: string;
  customerName: string;
  bookingId: string;
  bookingCode: string;
  bedIds: string[];
  included: boolean;
  exclusionReason?: ElectricityOccupantExclusionReason;
  invoiceId?: string | null;
  invoiceStatus?: string | null;
};

export type RoomElectricityReconciliationReport = {
  roomId: string;
  roomNumber: string | null;
  billingMonth: string;
  billId: string | null;
  totalBillPaise: number;
  occupants: ElectricityOccupantTrace[];
  eligibleCount: number;
  invoicedCount: number;
  missingInvoiceCustomerIds: string[];
  peerMismatch: boolean;
};

export async function reconcileRoomElectricityBilling(input: {
  roomId: string;
  billingMonth: string;
}): Promise<RoomElectricityReconciliationReport> {
  const [roomRow] = await db
    .select({ roomNumber: rooms.roomNumber })
    .from(rooms)
    .where(eq(rooms.id, input.roomId))
    .limit(1);

  const [bill] = await db
    .select({ id: electricityBills.id, totalPaise: electricityBills.totalPaise })
    .from(electricityBills)
    .where(
      and(
        eq(electricityBills.roomId, input.roomId),
        eq(electricityBills.billingMonth, input.billingMonth),
      ),
    )
    .limit(1);

  const allocation = await loadRoomElectricityOccupantsForMonth({
    roomId: input.roomId,
    billingMonth: input.billingMonth,
    includeFixedStay: true,
    useProRataByActiveDays: true,
  });

  const allocatedByCustomer = new Map<string, RoomElectricityOccupantRow>();
  for (const occ of allocation.occupants) {
    allocatedByCustomer.set(occ.customerId, occ);
  }

  const invoiceRows = bill
    ? await db
        .select({
          id: electricityInvoices.id,
          customerId: electricityInvoices.customerId,
          bookingId: electricityInvoices.bookingId,
          status: electricityInvoices.status,
          customerName: customers.fullName,
        })
        .from(electricityInvoices)
        .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
        .where(
          and(
            eq(electricityInvoices.electricityBillId, bill.id),
            eq(electricityInvoices.billingMonth, input.billingMonth),
          ),
        )
    : [];

  const invoiceByCustomer = new Map(
    invoiceRows.map((r) => [r.customerId, r] as const),
  );

  const allCustomerIds = new Set<string>([
    ...allocatedByCustomer.keys(),
    ...invoiceByCustomer.keys(),
    ...allocation.excludedCustomerIds,
  ]);

  const occupants: ElectricityOccupantTrace[] = [];

  for (const customerId of allCustomerIds) {
    const allocated = allocatedByCustomer.get(customerId);
    const invoice = invoiceByCustomer.get(customerId);
    const [customer] = await db
      .select({
        fullName: customers.fullName,
        email: customers.email,
        isTest: customers.isTest,
        residencyStatus: customers.residencyStatus,
      })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    let exclusionReason: ElectricityOccupantExclusionReason | undefined;
    let included = Boolean(allocated);

    if (customer?.isTest) {
      included = false;
      exclusionReason = 'test_record';
    } else if (allocation.excludedCustomerIds.includes(customerId)) {
      included = false;
      exclusionReason = allocation.checkoutCollectedByCustomerId.has(customerId)
        ? 'checkout_collected'
        : 'checkout_settled';
    } else if (!allocated && invoice) {
      included = false;
      exclusionReason = 'not_in_allocation';
    } else if (allocated && !invoice) {
      included = true;
    } else if (!allocated && !invoice) {
      included = false;
      exclusionReason = 'non_billable_status';
    }

    if (
      included &&
      customer &&
      !isMonthlyElectricityBillableOccupant({
        reservationStatus: 'active',
        bookingStatus: 'confirmed',
        residencyStatus: customer.residencyStatus,
        customerEmail: customer.email,
      })
    ) {
      included = false;
      exclusionReason = 'non_billable_status';
    }

    occupants.push({
      customerId,
      customerName: customer?.fullName ?? invoice?.customerName ?? customerId,
      bookingId: allocated?.bookingId ?? invoice?.bookingId ?? '',
      bookingCode: '',
      bedIds: allocated?.bedIds ?? [],
      included,
      exclusionReason: included ? undefined : exclusionReason,
      invoiceId: invoice?.id ?? null,
      invoiceStatus: invoice?.status ?? null,
    });
  }

  const eligible = occupants.filter((o) => o.included);
  const invoiced = eligible.filter((o) => o.invoiceId);
  const missingInvoiceCustomerIds = eligible
    .filter((o) => !o.invoiceId)
    .map((o) => o.customerId);

  const invoicedWithoutEligible = occupants.filter((o) => o.invoiceId && !o.included);
  const peerMismatch =
    missingInvoiceCustomerIds.length > 0 || invoicedWithoutEligible.length > 0;

  return {
    roomId: input.roomId,
    roomNumber: roomRow?.roomNumber ?? null,
    billingMonth: input.billingMonth,
    billId: bill?.id ?? null,
    totalBillPaise: bill?.totalPaise ?? 0,
    occupants,
    eligibleCount: eligible.length,
    invoicedCount: invoiced.length,
    missingInvoiceCustomerIds,
    peerMismatch,
  };
}

export async function listRoomElectricityPeerMismatches(billingMonth: string): Promise<
  Array<{
    roomId: string;
    roomNumber: string | null;
    report: RoomElectricityReconciliationReport;
  }>
> {
  const bills = await db
    .select({
      roomId: electricityBills.roomId,
      roomNumber: rooms.roomNumber,
    })
    .from(electricityBills)
    .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
    .where(eq(electricityBills.billingMonth, billingMonth));

  const mismatches: Array<{
    roomId: string;
    roomNumber: string | null;
    report: RoomElectricityReconciliationReport;
  }> = [];

  for (const bill of bills) {
    const report = await reconcileRoomElectricityBilling({
      roomId: bill.roomId,
      billingMonth,
    });
    if (report.peerMismatch) {
      mismatches.push({
        roomId: bill.roomId,
        roomNumber: bill.roomNumber,
        report,
      });
    }
  }

  return mismatches;
}
