/**
 * Shared loader for resident pay-electricity page (resident route + admin preview).
 */
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  beds,
  bookings,
  customers,
  electricityBills,
  electricityInvoices,
  floors,
  rooms,
} from '@/src/db/schema';
import {
  DEFAULT_ELECTRICITY_DAILY_QR_PATH,
  DEFAULT_ELECTRICITY_DAILY_UPI_ID,
} from '@/src/lib/payments/defaultQr';
import {
  getElectricityBreakdownForInvoice,
  projectElectricityInvoice,
} from '@/src/services/electricityBilling';
import {
  ensureDefaultPaymentCategoriesForPg,
  getElectricityDailyCategory,
} from '@/src/services/pgPaymentDefaults';
import { getActiveRejectionForEntity } from '@/src/services/paymentProofRejectionService';
import type { ElectricityInvoice } from '@/src/db/schema/electricityInvoices';
import type { ResidentElectricityBillExplanation } from '@/src/lib/residents/residentElectricityBillExplanationTypes';
import { loadResidentElectricityBillExplanation } from '@/src/lib/residents/residentElectricityBillExplanation';

export type ResidentPayElectricityPageData = {
  invoice: ElectricityInvoice;
  projection: ReturnType<typeof projectElectricityInvoice>;
  customerFullName: string;
  bookingCode: string;
  bedCode: string;
  roomNumber: string;
  pgId: string;
  paymentProofUrl: string | null;
  paymentProofTransactionRef: string | null;
  calculation: Awaited<ReturnType<typeof getElectricityBreakdownForInvoice>>;
  explanation: ResidentElectricityBillExplanation | null;
  activeRejection: Awaited<ReturnType<typeof getActiveRejectionForEntity>>;
  qrImageUrl: string;
  upiId: string;
};

export async function loadResidentPayElectricityPageData(
  invoiceId: string,
): Promise<ResidentPayElectricityPageData | null> {
  const [invoiceRow] = await db
    .select()
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, invoiceId))
    .limit(1);
  if (!invoiceRow) return null;

  const [row] = await db
    .select({
      bookingCode: bookings.bookingCode,
      customerFullName: customers.fullName,
      bedCode: beds.bedCode,
      roomNumber: rooms.roomNumber,
      pgId: floors.pgId,
      paymentProofUrl: electricityInvoices.paymentProofUrl,
      paymentProofTransactionRef: electricityInvoices.paymentProofTransactionRef,
    })
    .from(electricityInvoices)
    .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
    .innerJoin(beds, eq(beds.id, electricityInvoices.bedId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(electricityInvoices.id, invoiceId))
    .limit(1);
  if (!row) return null;

  const projection = projectElectricityInvoice(invoiceRow);
  const calculation = await getElectricityBreakdownForInvoice(invoiceId);
  const explanation = await loadResidentElectricityBillExplanation(
    invoiceId,
    invoiceRow.customerId,
  );
  const activeRejection = await getActiveRejectionForEntity('electricity_invoice', invoiceId);

  await ensureDefaultPaymentCategoriesForPg(row.pgId);
  const elecCategory = await getElectricityDailyCategory(row.pgId);

  return {
    invoice: invoiceRow,
    projection,
    customerFullName: row.customerFullName,
    bookingCode: row.bookingCode,
    bedCode: row.bedCode,
    roomNumber: row.roomNumber,
    pgId: row.pgId,
    paymentProofUrl: row.paymentProofUrl,
    paymentProofTransactionRef: row.paymentProofTransactionRef,
    calculation,
    explanation,
    activeRejection,
    qrImageUrl: elecCategory?.qrCodeImageUrl ?? DEFAULT_ELECTRICITY_DAILY_QR_PATH,
    upiId: elecCategory?.upiId ?? DEFAULT_ELECTRICITY_DAILY_UPI_ID,
  };
}
