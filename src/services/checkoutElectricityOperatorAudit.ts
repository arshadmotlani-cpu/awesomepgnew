import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { customers, electricityBills, electricityInvoices } from '@/src/db/schema';
import {
  buildCheckoutElectricityOperatorAudit,
  type CheckoutElectricityOperatorAudit,
} from '@/src/lib/checkout/checkoutElectricityOperatorAudit';
import { pickFinalizedBillForCheckout } from '@/src/lib/billing/electricityMeterPeriodSsot';
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import { loadHistoricalRoomOccupantSlicesForPeriod } from '@/src/lib/billing/roomElectricityCheckoutOccupants';
import { firstOfMonth } from '@/src/services/billing';
import { loadRoomElectricityCollectedByCustomerForMonth } from '@/src/services/electricityRoomContributions';
import {
  loadFinalizedElectricityBillsForRoom,
  resolveRoomPreviousMeterReading,
} from '@/src/services/roomMeterReadingSsot';
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
  const vacatingExclusive = formatDate(addDays(parseDate(input.vacatingDate), 1));

  const finalizedRows = await loadFinalizedElectricityBillsForRoom(input.roomId);
  const meterPeriodRows = finalizedRows.map((b) => ({
    id: undefined,
    billingMonth: b.billingMonth,
    previousReadingUnits: b.previousReadingUnits ?? 0,
    currentReadingUnits: b.currentReadingUnits,
    periodStartDate: b.periodStartDate,
    periodEndDate: b.periodEndDate,
    createdAt: b.createdAt,
  }));
  const picked = pickFinalizedBillForCheckout(
    meterPeriodRows,
    input.checkoutCurrentUnits,
  );

  let finalizedBill = null;
  let invoiceBillId: string | null = null;
  if (picked) {
    const [billRow] = await db
      .select({
        id: electricityBills.id,
        opening: electricityBills.previousReadingUnits,
        closing: electricityBills.currentReadingUnits,
        totalPaise: electricityBills.totalPaise,
        ratePerUnitPaise: electricityBills.ratePerUnitPaise,
        periodStartDate: electricityBills.periodStartDate,
        periodEndDate: electricityBills.periodEndDate,
        createdAt: electricityBills.createdAt,
      })
      .from(electricityBills)
      .where(
        and(
          eq(electricityBills.roomId, input.roomId),
          eq(electricityBills.previousReadingUnits, picked.previousReadingUnits.toString()),
          eq(electricityBills.currentReadingUnits, picked.currentReadingUnits.toString()),
          isProductionElectricityBillFilter(),
        ),
      )
      .limit(1);
    if (billRow) {
      invoiceBillId = billRow.id;
      const periodStart =
        billRow.periodStartDate ??
        picked.periodStartDate ??
        firstOfMonth(picked.billingMonth);
      const periodEnd = billRow.periodEndDate ?? picked.periodEndDate ?? input.vacatingDate;
      finalizedBill = {
        billingMonth: picked.billingMonth,
        openingUnits: Number(billRow.opening),
        closingUnits: Number(billRow.closing),
        grossPaise: Number(billRow.totalPaise),
        ratePerUnitPaise: Number(billRow.ratePerUnitPaise ?? input.ratePerUnitPaise),
        finalizedOnDate: formatDate(addDays(parseDate(periodEnd), 1)),
        periodStartDate: periodStart,
        periodEndDate: periodEnd,
      };
    }
  }

  const baseline = await resolveRoomPreviousMeterReading(input.roomId, {
    beforeBillingMonth: billingMonth,
    enforceContinuity: false,
  });

  const invoiceRows = invoiceBillId
    ? await db
        .select({
          customerId: electricityInvoices.customerId,
          customerName: customers.fullName,
          amountPaise: electricityInvoices.amountPaise,
          paidPaise: electricityInvoices.paidPaise,
          status: electricityInvoices.status,
        })
        .from(electricityInvoices)
        .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
        .where(
          and(
            eq(electricityInvoices.electricityBillId, invoiceBillId),
            ne(electricityInvoices.status, 'cancelled'),
          ),
        )
    : [];

  const tailStart =
    finalizedBill?.periodEndDate != null
      ? formatDate(addDays(parseDate(finalizedBill.periodEndDate), 1))
      : finalizedBill?.finalizedOnDate ?? billingMonth;
  const periodEndExclusive = vacatingExclusive;

  const occupants = await loadHistoricalRoomOccupantSlicesForPeriod({
    roomId: input.roomId,
    periodStart: finalizedBill?.periodStartDate ?? tailStart,
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
    finalizedBill?.closingUnits ??
    (baseline.source !== 'none' ? baseline.previousReadingUnits : input.checkoutPreviousUnits);

  return buildCheckoutElectricityOperatorAudit({
    billingMonth,
    vacatingDate: input.vacatingDate,
    ratePerUnitPaise: input.ratePerUnitPaise,
    chainOpeningUnits: chainOpening ?? null,
    checkoutClosingUnits: input.checkoutCurrentUnits,
    finalizedBill: finalizedBill
      ? {
          billingMonth: finalizedBill.billingMonth,
          openingUnits: finalizedBill.openingUnits,
          closingUnits: finalizedBill.closingUnits,
          grossPaise: finalizedBill.grossPaise,
          ratePerUnitPaise: finalizedBill.ratePerUnitPaise,
          finalizedOnDate: finalizedBill.finalizedOnDate,
        }
      : null,
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
