import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { customers, electricityBills, electricityInvoices } from '@/src/db/schema';
import {
  buildCheckoutElectricityOperatorAudit,
  type CheckoutElectricityOperatorAudit,
} from '@/src/lib/checkout/checkoutElectricityOperatorAudit';
import { formatDate } from '@/src/lib/dates';
import { loadHistoricalRoomOccupantSlicesForPeriod } from '@/src/lib/billing/roomElectricityCheckoutOccupants';
import { firstOfMonth, monthBounds } from '@/src/services/billing';
import { loadRoomElectricityCollectedByCustomerForMonth } from '@/src/services/electricityRoomContributions';
import { resolveRoomPreviousMeterReading } from '@/src/services/roomMeterReadingSsot';
import { isProductionElectricityBillFilter } from '@/src/lib/billing/electricityProductionFilter';

export async function loadCheckoutElectricityOperatorAudit(input: {
  roomId: string;
  bookingId: string;
  customerId: string;
  vacatingDate: string;
  checkoutPreviousUnits: number | null;
  checkoutCurrentUnits: number | null;
  ratePerUnitPaise: number;
  electricityCalculationMethod: string;
  electricitySharePaise: number;
  manualChargePaise: number | null;
  electricityDeductFromDeposit: boolean;
  excludeCheckoutSettlementId?: string | null;
}): Promise<CheckoutElectricityOperatorAudit | null> {
  if (input.checkoutCurrentUnits == null || !Number.isFinite(input.checkoutCurrentUnits)) {
    return null;
  }

  const billingMonth = firstOfMonth(input.vacatingDate);
  const { start: monthStart, end: monthEnd } = monthBounds(billingMonth);
  const periodEndExclusive = formatDate(
    new Date(
      Math.min(
        new Date(input.vacatingDate).getTime() + 86_400_000,
        monthEnd.getTime(),
      ),
    ),
  );

  const [billRow] = await db
    .select({
      opening: electricityBills.previousReadingUnits,
      closing: electricityBills.currentReadingUnits,
      totalPaise: electricityBills.totalPaise,
      ratePerUnitPaise: electricityBills.ratePerUnitPaise,
      createdAt: electricityBills.createdAt,
    })
    .from(electricityBills)
    .where(
      and(
        eq(electricityBills.roomId, input.roomId),
        eq(electricityBills.billingMonth, billingMonth),
        isProductionElectricityBillFilter(),
      ),
    )
    .limit(1);

  let finalizedBill = null;
  if (billRow) {
    finalizedBill = {
      billingMonth,
      openingUnits: Number(billRow.opening),
      closingUnits: Number(billRow.closing),
      grossPaise: Number(billRow.totalPaise),
      ratePerUnitPaise: Number(billRow.ratePerUnitPaise ?? input.ratePerUnitPaise),
      finalizedOnDate: formatDate(billRow.createdAt),
    };
  }

  const baseline = await resolveRoomPreviousMeterReading(input.roomId, {
    beforeBillingMonth: billingMonth,
    enforceContinuity: false,
  });

  const invoiceRows = await db
    .select({
      customerId: electricityInvoices.customerId,
      customerName: customers.fullName,
      amountPaise: electricityInvoices.amountPaise,
      paidPaise: electricityInvoices.paidPaise,
      status: electricityInvoices.status,
    })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .where(
      and(
        eq(electricityBills.roomId, input.roomId),
        eq(electricityInvoices.billingMonth, billingMonth),
        ne(electricityInvoices.status, 'cancelled'),
      ),
    );

  const occupants = await loadHistoricalRoomOccupantSlicesForPeriod({
    roomId: input.roomId,
    periodStart: formatDate(monthStart),
    periodEndExclusive,
  });

  const collectedByCustomer = await loadRoomElectricityCollectedByCustomerForMonth(
    input.roomId,
    billingMonth,
    { excludeCheckoutSettlementId: input.excludeCheckoutSettlementId },
  );

  const invoiceCustomerIds = new Set(invoiceRows.map((r) => r.customerId));
  const extraCollected = new Map<string, number>();
  for (const [cid, amt] of collectedByCustomer) {
    if (!invoiceCustomerIds.has(cid) && amt > 0) {
      extraCollected.set(cid, amt);
    }
  }

  const chainOpening =
    finalizedBill?.openingUnits ??
    (baseline.source !== 'none' ? baseline.previousReadingUnits : input.checkoutPreviousUnits);

  return buildCheckoutElectricityOperatorAudit({
    billingMonth,
    vacatingDate: input.vacatingDate,
    ratePerUnitPaise: input.ratePerUnitPaise,
    chainOpeningUnits: chainOpening ?? null,
    checkoutClosingUnits: input.checkoutCurrentUnits,
    finalizedBill,
    invoiceCredits: invoiceRows.map((r) => ({
      customerId: r.customerId,
      customerName: r.customerName,
      amountPaise: Number(r.amountPaise),
      paidPaise: Number(r.paidPaise),
      status: String(r.status),
    })),
    occupants,
    currentCustomerId: input.customerId,
    extraCollectedByCustomerId: extraCollected,
    electricityCalculationMethod: input.electricityCalculationMethod,
    electricitySharePaise: input.electricitySharePaise,
    manualChargePaise: input.manualChargePaise,
    electricityDeductFromDeposit: input.electricityDeductFromDeposit,
  });
}
