/**
 * September 2026 electricity fleet certification — read-only.
 * Audits every PG / AC room from canonical room inventory + historical occupancy SSOT.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  customers,
  electricityBills,
  electricityInvoices,
} from '@/src/db/schema';
import { allocateMonthlyElectricityInvoices } from '@/src/lib/billing/roomElectricityMonthlyAllocation';
import { loadFleetElectricityBillingSummary } from '@/src/lib/billing/fleetElectricityBillingStatus';
import { loadRoomElectricityOccupantsForMonth } from '@/src/lib/billing/roomElectricityOccupants';
import { reconcileRoomElectricityBilling } from '@/src/lib/billing/roomElectricityReconciliation';
import { auditElectricityInvoiceOwnership } from '@/src/services/electricityInvoiceOwnership';
import { countActiveBedsInRoom } from '@/src/lib/roomCapacitySsotDb';
import { loadRoomElectricityContributionsForMonth } from '@/src/services/electricityRoomContributions';
import { listCheckoutElectricityLedgerForRoomMonth } from '@/src/services/electricitySettlementLedger';
import { sumManualElectricityCreditsForRoomMonth } from '@/src/services/electricitySettlementLedgerView';
import { listElectricityBillsWithoutInvoices } from '@/src/services/repairElectricityBillMissingInvoices';
import { paiseToInr } from '@/src/lib/format';

export const SEPTEMBER_2026_BILLING_MONTH = '2026-09-01';

export type SeptemberElectricityRoomCertRow = {
  pgName: string;
  roomNumber: string;
  roomId: string;
  maintenance: boolean;
  checklistStatus: string;
  previousReading: number | null;
  currentReading: number | null;
  units: number | null;
  ratePerUnitPaise: number | null;
  roomTotalPaise: number | null;
  billStatus: 'billed' | 'missing' | 'excluded';
  residentCount: number;
  storedAllocationPaise: number;
  canonicalAllocationPaise: number;
  allocationDifferencePaise: number;
  unallocatedPaise: number;
  invoiceCount: number;
  duplicateInvoiceCount: number;
  paidPreservedPaise: number;
  ownershipFlags: string[];
  reconciliationMismatch: boolean;
  notes: string[];
};

export type SeptemberElectricityCertificationReport = {
  billingMonth: string;
  auditedAt: string;
  pgCount: number;
  roomCount: number;
  billsExisting: number;
  billsMissing: number;
  maintenanceExcluded: number;
  needMeterReading: number;
  notEligible: number;
  reconciliationRequired: number;
  duplicateInvoiceCount: number;
  ownershipFlagCount: number;
  paidPreservedPaise: number;
  billWithoutInvoicesCount: number;
  billWithoutInvoicesRooms: Array<{ pgName: string; roomNumber: string; billId: string }>;
  /** True when the only blocking issues are BILL_WITHOUT_INVOICES (repairable). */
  passExceptBillWithoutInvoices: boolean;
  pass: boolean;
  rooms: SeptemberElectricityRoomCertRow[];
  room204: SeptemberElectricityRoomCertRow | null;
  room402Female: SeptemberElectricityRoomCertRow | null;
  saswatSeptemberPaidPaise: number | null;
};

async function computeCanonicalAllocationPaise(input: {
  roomId: string;
  billingMonth: string;
  grossTotalPaise: number;
  /**
   * For already-billed rooms, use the bill's stored prepaid credit — never the
   * live room prepaid balance (which may have been restored after BILL_WITHOUT_INVOICES repair).
   */
  prepaidCreditPaise: number;
}): Promise<{ totalPaise: number; unallocatedPaise: number; residentCount: number }> {
  const checkoutRows = await listCheckoutElectricityLedgerForRoomMonth(
    input.roomId,
    input.billingMonth,
    { status: 'collected' },
  );
  const checkoutCollectedByCustomerId = new Map<string, number>();
  for (const row of checkoutRows) {
    checkoutCollectedByCustomerId.set(
      row.customerId,
      (checkoutCollectedByCustomerId.get(row.customerId) ?? 0) + row.amountPaise,
    );
  }

  const contributionsLoad = await loadRoomElectricityContributionsForMonth(
    input.roomId,
    input.billingMonth,
  );
  const manualCreditPaise = await sumManualElectricityCreditsForRoomMonth(
    input.roomId,
    input.billingMonth,
  );
  const occupantLoad = await loadRoomElectricityOccupantsForMonth({
    roomId: input.roomId,
    billingMonth: input.billingMonth,
    includeFixedStay: true,
    useProRataByActiveDays: true,
  });
  const activeBedCount = await countActiveBedsInRoom(input.roomId);

  const allocation = allocateMonthlyElectricityInvoices({
    grossTotalPaise: input.grossTotalPaise,
    prepaidCreditPaise: input.prepaidCreditPaise,
    contributionsByCustomerId:
      contributionsLoad.contributions.length > 0 ? contributionsLoad.byCustomerId : undefined,
    manualCreditPaise: contributionsLoad.contributions.length > 0 ? undefined : manualCreditPaise,
    occupants: occupantLoad.occupants,
    checkoutCollectedByCustomerId,
    useProRata: true,
    activeBedCount,
    billingDays: occupantLoad.billingDays,
  });

  const totalPaise = allocation.invoices.reduce((sum, line) => sum + line.amountPaise, 0);
  return {
    totalPaise,
    unallocatedPaise: allocation.emptyDayPaise + allocation.remainderPaise,
    residentCount: occupantLoad.occupants.length,
  };
}

export async function runSeptember2026ElectricityCertification(): Promise<SeptemberElectricityCertificationReport> {
  const billingMonth = SEPTEMBER_2026_BILLING_MONTH;
  const fleet = await loadFleetElectricityBillingSummary(billingMonth);
  const ownership = await auditElectricityInvoiceOwnership(billingMonth);
  const ownershipByRoomCustomer = new Map<string, string[]>();
  for (const row of ownership.rows) {
    if (row.flags.length === 0) continue;
    const key = `${row.roomNumber}:${row.residentName}`;
    ownershipByRoomCustomer.set(key, row.flags);
  }

  const billWithoutInvoices = await listElectricityBillsWithoutInvoices(billingMonth);
  const billWithoutInvoicesBillIds = new Set(billWithoutInvoices.map((p) => p.billId));

  const rooms: SeptemberElectricityRoomCertRow[] = [];

  for (const checklist of fleet.checklists) {
    for (const room of checklist.rooms) {
      const notes: string[] = [];
      let storedAllocationPaise = 0;
      let canonicalAllocationPaise = 0;
      let unallocatedPaise = 0;
      let invoiceCount = 0;
      let duplicateInvoiceCount = 0;
      let paidPreservedPaise = 0;
      let reconciliationMismatch = false;
      const ownershipFlags: string[] = [];

      if (room.status === 'already_billed' && room.billId) {
        const invoices = await db
          .select({
            amountPaise: electricityInvoices.amountPaise,
            paidPaise: electricityInvoices.paidPaise,
            status: electricityInvoices.status,
            customerId: electricityInvoices.customerId,
            customerName: customers.fullName,
          })
          .from(electricityInvoices)
          .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
          .where(
            and(
              eq(electricityInvoices.electricityBillId, room.billId),
              eq(electricityInvoices.billingMonth, billingMonth),
              sql`${electricityInvoices.status} <> 'cancelled'`,
            ),
          );

        invoiceCount = invoices.length;
        const countByCustomer = new Map<string, number>();
        for (const inv of invoices) {
          storedAllocationPaise += inv.amountPaise;
          paidPreservedPaise += inv.paidPaise;
          countByCustomer.set(inv.customerId, (countByCustomer.get(inv.customerId) ?? 0) + 1);
          const flags = ownershipByRoomCustomer.get(`${room.roomNumber}:${inv.customerName}`);
          if (flags?.length) ownershipFlags.push(...flags);
        }
        duplicateInvoiceCount = [...countByCustomer.values()].filter((c) => c > 1).length;

        const [billMeta] = await db
          .select({ prepaidCreditAppliedPaise: electricityBills.prepaidCreditAppliedPaise })
          .from(electricityBills)
          .where(eq(electricityBills.id, room.billId))
          .limit(1);

        const canonical = await computeCanonicalAllocationPaise({
          roomId: room.roomId,
          billingMonth,
          grossTotalPaise: room.billTotalPaise ?? 0,
          prepaidCreditPaise: billMeta?.prepaidCreditAppliedPaise ?? 0,
        });
        canonicalAllocationPaise = canonical.totalPaise;
        unallocatedPaise = canonical.unallocatedPaise;

        const reconciliation = await reconcileRoomElectricityBilling({
          roomId: room.roomId,
          billingMonth,
        });
        reconciliationMismatch = reconciliation.peerMismatch;
        if (reconciliationMismatch) {
          if (billWithoutInvoicesBillIds.has(room.billId)) {
            notes.push('BILL_WITHOUT_INVOICES — pending generic invoice fan-out repair.');
            reconciliationMismatch = false;
          } else {
            notes.push('Reconciliation peer mismatch — review allocation vs invoices.');
          }
        }
      } else if (room.status === 'reading_required') {
        notes.push('Needs current meter reading before bill generation.');
      } else if (room.status === 'maintenance_excluded') {
        notes.push('Entire room under maintenance — excluded.');
      } else if (room.status === 'not_eligible') {
        notes.push('No historical billable occupancy for September.');
      } else if (room.status === 'previous_unavailable') {
        notes.push('Previous meter reading unavailable.');
      }

      const occupantPreview =
        room.status !== 'maintenance_excluded'
          ? await loadRoomElectricityOccupantsForMonth({
              roomId: room.roomId,
              billingMonth,
              includeFixedStay: true,
              useProRataByActiveDays: true,
            })
          : { occupants: [] as Array<{ customerId: string }> };

      rooms.push({
        pgName: checklist.pgName,
        roomNumber: room.roomNumber,
        roomId: room.roomId,
        maintenance: room.status === 'maintenance_excluded',
        checklistStatus: room.status,
        previousReading: room.previousReadingUnits,
        currentReading: room.currentReadingUnits,
        units: room.unitsConsumed,
        ratePerUnitPaise: room.ratePerUnitPaise,
        roomTotalPaise: room.billTotalPaise,
        billStatus:
          room.status === 'already_billed'
            ? 'billed'
            : room.status === 'maintenance_excluded' || room.status === 'not_eligible'
              ? 'excluded'
              : 'missing',
        residentCount: occupantPreview.occupants.length,
        storedAllocationPaise,
        canonicalAllocationPaise,
        allocationDifferencePaise: storedAllocationPaise - canonicalAllocationPaise,
        unallocatedPaise,
        invoiceCount,
        duplicateInvoiceCount,
        paidPreservedPaise,
        ownershipFlags: [...new Set(ownershipFlags)],
        reconciliationMismatch,
        notes,
      });
    }
  }

  const room204 =
    rooms.find(
      (r) => r.roomNumber === '204' && /shantinagar/i.test(r.pgName),
    ) ?? null;
  const room402Female =
    rooms.find(
      (r) =>
        r.roomNumber === '402' &&
        /female|central.*female/i.test(r.pgName),
    ) ?? null;

  const [saswatPaidRow] = await db.execute<{ paid_paise: number | null }>(sql`
    SELECT coalesce(sum(ei.paid_paise), 0)::int AS paid_paise
    FROM electricity_invoices ei
    JOIN electricity_bills eb ON eb.id = ei.electricity_bill_id
    JOIN rooms r ON r.id = eb.room_id
    JOIN floors f ON f.id = r.floor_id
    JOIN pgs p ON p.id = f.pg_id
    JOIN customers c ON c.id = ei.customer_id
    WHERE ei.billing_month = ${billingMonth}::date
      AND ei.status <> 'cancelled'
      AND r.room_number = '204'
      AND p.name ILIKE '%shantinagar%'
      AND c.full_name ILIKE '%saswat%'
  `);

  const reconciliationRequired = rooms.filter((r) => {
    if (r.billStatus !== 'billed') return false;
    if (r.duplicateInvoiceCount > 0 || r.ownershipFlags.length > 0) return true;
    if (r.reconciliationMismatch) return true;
    // Allow operator-absorbed remainder / empty-day paise (≤ ₹1 total drift).
    const driftPaise = Math.abs(r.allocationDifferencePaise);
    return driftPaise > 100;
  }).length;

  const duplicateInvoiceCount = rooms.reduce((sum, r) => sum + r.duplicateInvoiceCount, 0);
  const ownershipFlagCount = rooms.filter((r) => r.ownershipFlags.length > 0).length;
  const paidPreservedPaise = rooms.reduce((sum, r) => sum + r.paidPreservedPaise, 0);
  const billWithoutInvoicesCount = billWithoutInvoices.length;
  const billWithoutInvoicesRooms = billWithoutInvoices.map((p) => ({
    pgName: p.pgName,
    roomNumber: p.roomNumber,
    billId: p.billId,
  }));

  const hardFailures =
    reconciliationRequired > 0 || duplicateInvoiceCount > 0 || ownershipFlagCount > 0;
  const passExceptBillWithoutInvoices = !hardFailures;
  const pass = passExceptBillWithoutInvoices && billWithoutInvoicesCount === 0;

  return {
    billingMonth,
    auditedAt: new Date().toISOString(),
    pgCount: fleet.pgCount,
    roomCount: fleet.totalRooms,
    billsExisting: fleet.alreadyBilled,
    billsMissing: fleet.needBill,
    maintenanceExcluded: fleet.maintenanceExcluded,
    needMeterReading: fleet.needMeterReading,
    notEligible: fleet.notEligible,
    reconciliationRequired,
    duplicateInvoiceCount,
    ownershipFlagCount,
    paidPreservedPaise,
    billWithoutInvoicesCount,
    billWithoutInvoicesRooms,
    passExceptBillWithoutInvoices,
    pass,
    rooms,
    room204,
    room402Female,
    saswatSeptemberPaidPaise: saswatPaidRow?.paid_paise ?? null,
  };
}

export function formatSeptemberElectricityCertificationSummary(
  report: SeptemberElectricityCertificationReport,
): string {
  const lines: string[] = [
    `September 2026 Electricity Certification (${report.auditedAt})`,
    `PGs: ${report.pgCount} · Rooms: ${report.roomCount}`,
    `Bills existing: ${report.billsExisting} · Missing: ${report.billsMissing}`,
    `Maintenance excluded: ${report.maintenanceExcluded} · Need meter: ${report.needMeterReading}`,
    `Reconciliation required: ${report.reconciliationRequired}`,
    `Duplicate invoices: ${report.duplicateInvoiceCount} · Ownership flags: ${report.ownershipFlagCount}`,
    `Paid preserved total: ${paiseToInr(report.paidPreservedPaise)}`,
    `BILL_WITHOUT_INVOICES: ${report.billWithoutInvoicesCount}`,
    `PASS (except BILL_WITHOUT_INVOICES): ${report.passExceptBillWithoutInvoices ? 'YES' : 'NO'}`,
    `PASS (full): ${report.pass ? 'YES' : 'NO'}`,
  ];

  if (report.billWithoutInvoicesRooms.length > 0) {
    lines.push('', 'BILL_WITHOUT_INVOICES rooms:');
    for (const row of report.billWithoutInvoicesRooms) {
      lines.push(`  ${row.pgName} · Room ${row.roomNumber} · ${row.billId}`);
    }
  }

  if (report.room204) {
    const r = report.room204;
    lines.push(
      '',
      `Room 204 Shantinagar: ${paiseToInr(r.roomTotalPaise ?? 0)} room total · ` +
        `${r.units ?? '?'} units · stored alloc ${paiseToInr(r.storedAllocationPaise)} · ` +
        `canonical ${paiseToInr(r.canonicalAllocationPaise)} · diff ${paiseToInr(r.allocationDifferencePaise)}`,
    );
  }
  if (report.room402Female) {
    const r = report.room402Female;
    lines.push(
      `Room 402 Female: prev ${r.previousReading} → current ${r.currentReading} · ` +
        `${r.units ?? '?'} units · ${paiseToInr(r.roomTotalPaise ?? 0)}`,
    );
  }
  if (report.saswatSeptemberPaidPaise != null) {
    lines.push(`Saswat Sep paid preserved: ${paiseToInr(report.saswatSeptemberPaidPaise)}`);
  }

  const mismatches = report.rooms.filter(
    (r) =>
      r.billStatus === 'billed' &&
      (r.reconciliationMismatch || r.allocationDifferencePaise !== 0 || r.ownershipFlags.length > 0),
  );
  if (mismatches.length > 0) {
    lines.push('', 'Rooms needing reconciliation:');
    for (const row of mismatches.slice(0, 25)) {
      lines.push(
        `  ${row.pgName} · Room ${row.roomNumber} · diff ${paiseToInr(row.allocationDifferencePaise)} · ${row.ownershipFlags.join(', ') || 'allocation drift'}`,
      );
    }
    if (mismatches.length > 25) {
      lines.push(`  … and ${mismatches.length - 25} more`);
    }
  }

  return lines.join('\n');
}
