/**
 * Room-month electricity occupant vs invoice reconciliation with explicit exclusion reasons.
 */
import { and, eq, sql } from 'drizzle-orm';
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
import type { ElectricityBillCalculationBreakdown } from '@/src/lib/billing/electricityBillBreakdownTypes';

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
  duplicateInvoiceCustomerIds: string[];
  duplicateResidentDayKeys: string[];
  nonzeroLateFeeInvoiceIds: string[];
  emptyDayPaise: number;
  conservationDriftPaise: number;
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
    .select({
      id: electricityBills.id,
      totalPaise: electricityBills.totalPaise,
      calculationBreakdown: electricityBills.calculationBreakdown,
    })
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
          lateFeeLockedPaise: electricityInvoices.lateFeeLockedPaise,
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

  const activeInvoiceRows = invoiceRows.filter((row) => row.status !== 'cancelled');
  const invoiceByCustomer = new Map(activeInvoiceRows.map((r) => [r.customerId, r] as const));
  const invoiceCountByCustomer = new Map<string, number>();
  for (const invoice of activeInvoiceRows) {
    invoiceCountByCustomer.set(
      invoice.customerId,
      (invoiceCountByCustomer.get(invoice.customerId) ?? 0) + 1,
    );
  }
  const duplicateInvoiceCustomerIds = [...invoiceCountByCustomer]
    .filter(([, count]) => count > 1)
    .map(([customerId]) => customerId);
  const nonzeroLateFeeInvoiceIds = activeInvoiceRows
    .filter((invoice) => (invoice.lateFeeLockedPaise ?? 0) !== 0)
    .map((invoice) => invoice.id);
  const breakdown = (bill?.calculationBreakdown ?? null) as ElectricityBillCalculationBreakdown | null;
  const timelineByCustomer = new Map(
    (breakdown?.timeline ?? []).map((entry) => [entry.customerId, entry] as const),
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
        isTest: customers.isTest,
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
    .filter((o) => {
      if (o.invoiceId) return false;
      const timeline = timelineByCustomer.get(o.customerId);
      if (!timeline) return true;
      return (
        timeline.calculatedSharePaise -
          timeline.creditAppliedToRoomBillPaise >
        0
      );
    })
    .map((o) => o.customerId);

  const invoicedWithoutEligible = occupants.filter((o) => o.invoiceId && !o.included);
  const duplicateCoverageRows = await db.execute(sql`
    SELECT customer_id::text, occupied_day::text
    FROM (
      SELECT b.customer_id, gs::date AS occupied_day, count(DISTINCT br.id) AS source_count
      FROM bed_reservations br
      JOIN bookings b ON b.id = br.booking_id
      JOIN beds bed ON bed.id = br.bed_id
      CROSS JOIN LATERAL generate_series(
        greatest(lower(br.stay_range), ${input.billingMonth}::date),
        least(
          coalesce(upper(br.stay_range), (${input.billingMonth}::date + interval '1 month')::date),
          (${input.billingMonth}::date + interval '1 month')::date
        ) - interval '1 day',
        interval '1 day'
      ) gs
      WHERE bed.room_id = ${input.roomId}::uuid
        AND br.kind = 'primary'
        AND br.status IN ('active', 'completed')
      GROUP BY b.customer_id, gs::date
      HAVING count(DISTINCT br.id) > 1
    ) duplicate_days
  `);
  const duplicateResidentDayKeys = (
    duplicateCoverageRows as unknown as Array<{ customer_id: string; occupied_day: string }>
  ).map((row) => `${row.customer_id}:${row.occupied_day}`);
  const conservationDriftPaise = breakdown?.conservation
    ? breakdown.conservation.accountedTotalPaise - (bill?.totalPaise ?? 0)
    : 0;
  const emptyDayPaise = breakdown?.conservation?.emptyDayPaise ?? 0;
  const peerMismatch =
    missingInvoiceCustomerIds.length > 0 ||
    invoicedWithoutEligible.length > 0 ||
    duplicateInvoiceCustomerIds.length > 0 ||
    nonzeroLateFeeInvoiceIds.length > 0 ||
    conservationDriftPaise !== 0;

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
    duplicateInvoiceCustomerIds,
    duplicateResidentDayKeys,
    nonzeroLateFeeInvoiceIds,
    emptyDayPaise,
    conservationDriftPaise,
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
