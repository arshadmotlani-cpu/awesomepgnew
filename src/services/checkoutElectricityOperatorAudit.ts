import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityBills, electricityInvoices } from '@/src/db/schema';
import {
  buildCheckoutElectricityOperatorAudit,
  type CheckoutElectricityOperatorAudit,
  type CheckoutResidentElectricityInvoiceSnapshot,
} from '@/src/lib/checkout/checkoutElectricityOperatorAudit';
import { resolveAuthoritativeRoomElectricityBillPaiseForCheckout } from '@/src/lib/checkout/roomElectricityCheckoutBill';
import { firstOfMonth } from '@/src/services/billing';
import { loadRoomElectricityCollectedByCustomerForMonth } from '@/src/services/electricityRoomContributions';

export async function loadCheckoutElectricityOperatorAudit(input: {
  roomId: string;
  bookingId: string;
  customerId: string;
  vacatingDate: string;
  meterDerivedTotalPaise: number;
  electricityCalculationMethod: string;
  electricitySharePaise: number;
  manualChargePaise: number | null;
  electricityDeductFromDeposit: boolean;
  excludeCheckoutSettlementId?: string | null;
}): Promise<CheckoutElectricityOperatorAudit> {
  const billingMonth = firstOfMonth(input.vacatingDate);
  const { totalBillPaise, source } = await resolveAuthoritativeRoomElectricityBillPaiseForCheckout({
    roomId: input.roomId,
    vacatingDate: input.vacatingDate,
    meterDerivedTotalPaise: input.meterDerivedTotalPaise,
  });

  const [invoiceRow] = await db
    .select({
      amountPaise: electricityInvoices.amountPaise,
      paidPaise: electricityInvoices.paidPaise,
      status: electricityInvoices.status,
      invoiceNumber: electricityInvoices.invoiceNumber,
      billingMonth: electricityInvoices.billingMonth,
    })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .where(
      and(
        eq(electricityInvoices.bookingId, input.bookingId),
        eq(electricityInvoices.billingMonth, billingMonth),
        ne(electricityInvoices.status, 'cancelled'),
      ),
    )
    .limit(1);

  let residentInvoice: CheckoutResidentElectricityInvoiceSnapshot | null = null;
  if (invoiceRow) {
    residentInvoice = {
      billingMonth: String(invoiceRow.billingMonth),
      amountPaise: Number(invoiceRow.amountPaise),
      paidPaise: Number(invoiceRow.paidPaise),
      status: String(invoiceRow.status),
      invoiceNumber: invoiceRow.invoiceNumber,
    };
  }

  const collectedByCustomer = await loadRoomElectricityCollectedByCustomerForMonth(
    input.roomId,
    billingMonth,
    { excludeCheckoutSettlementId: input.excludeCheckoutSettlementId },
  );
  const fallbackCollected = collectedByCustomer.get(input.customerId) ?? 0;

  return buildCheckoutElectricityOperatorAudit({
    billingMonth,
    authoritativeBillPaise: totalBillPaise,
    billSource: source,
    staleMeterDerivedBillPaise:
      input.meterDerivedTotalPaise > 0 && source === 'electricity_bill'
        ? input.meterDerivedTotalPaise
        : null,
    residentInvoice,
    fallbackCollectedPaise: fallbackCollected,
    electricityCalculationMethod: input.electricityCalculationMethod,
    electricitySharePaise: input.electricitySharePaise,
    manualChargePaise: input.manualChargePaise,
    electricityDeductFromDeposit: input.electricityDeductFromDeposit,
  });
}
