/**
 * Pre-0087 electricity_invoices columns — safe to select before migration 0087 runs.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityInvoices } from '@/src/db/schema';
import type { ElectricityInvoice } from '@/src/db/schema/electricityInvoices';

type DbExecutor = Pick<typeof db, 'select'>;

/** Explicit column pick list; avoids Drizzle selecting room_id / dedup columns early. */
export const electricityInvoiceLegacySelect = {
  id: electricityInvoices.id,
  invoiceNumber: electricityInvoices.invoiceNumber,
  electricityBillId: electricityInvoices.electricityBillId,
  bookingId: electricityInvoices.bookingId,
  customerId: electricityInvoices.customerId,
  bedId: electricityInvoices.bedId,
  billingMonth: electricityInvoices.billingMonth,
  dueDate: electricityInvoices.dueDate,
  amountPaise: electricityInvoices.amountPaise,
  paidPaise: electricityInvoices.paidPaise,
  lateFeeLockedPaise: electricityInvoices.lateFeeLockedPaise,
  status: electricityInvoices.status,
  paymentId: electricityInvoices.paymentId,
  paidAt: electricityInvoices.paidAt,
  paymentProofUrl: electricityInvoices.paymentProofUrl,
  unitsShare: electricityInvoices.unitsShare,
  activeDays: electricityInvoices.activeDays,
  cancelledAt: electricityInvoices.cancelledAt,
  createdAt: electricityInvoices.createdAt,
  updatedAt: electricityInvoices.updatedAt,
} as const;

export type ElectricityInvoiceLegacyRow = {
  id: string;
  invoiceNumber: string;
  electricityBillId: string;
  bookingId: string;
  customerId: string;
  bedId: string;
  billingMonth: string;
  dueDate: string;
  amountPaise: number;
  paidPaise: number;
  lateFeeLockedPaise: number | null;
  status: 'pending' | 'paid' | 'cancelled';
  paymentId: string | null;
  paidAt: Date | null;
  paymentProofUrl: string | null;
  unitsShare: string | null;
  activeDays: number | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Satisfies projectElectricityInvoice / ElectricityInvoice consumers on legacy DBs. */
export function asElectricityInvoiceRow(
  row: ElectricityInvoiceLegacyRow,
  extras?: {
    roomId?: string;
    supersededByInvoiceId?: string | null;
    duplicateDetectedAt?: Date | null;
  },
): ElectricityInvoice {
  return {
    ...row,
    roomId: extras?.roomId ?? '',
    supersededByInvoiceId: extras?.supersededByInvoiceId ?? null,
    duplicateDetectedAt: extras?.duplicateDetectedAt ?? null,
  };
}

/** Single-row fetch without migration 0087 columns in SELECT. */
export async function fetchElectricityInvoiceById(
  id: string,
  executor: DbExecutor = db,
): Promise<ElectricityInvoice | null> {
  const [row] = await executor
    .select(electricityInvoiceLegacySelect)
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, id))
    .limit(1);
  return row ? asElectricityInvoiceRow(row) : null;
}

/** Booking-scoped list without migration 0087 columns in SELECT. */
export async function fetchElectricityInvoicesByBookingId(
  bookingId: string,
  executor: DbExecutor = db,
): Promise<ElectricityInvoice[]> {
  const rows = await executor
    .select(electricityInvoiceLegacySelect)
    .from(electricityInvoices)
    .where(eq(electricityInvoices.bookingId, bookingId));
  return rows.map((row) => asElectricityInvoiceRow(row));
}

/** Lookup by booking + billing month without migration 0087 columns in SELECT. */
export async function fetchElectricityInvoiceByBookingAndMonth(
  bookingId: string,
  billingMonth: string,
  executor: DbExecutor = db,
): Promise<ElectricityInvoice | null> {
  const [row] = await executor
    .select(electricityInvoiceLegacySelect)
    .from(electricityInvoices)
    .where(
      and(
        eq(electricityInvoices.bookingId, bookingId),
        eq(electricityInvoices.billingMonth, billingMonth),
      ),
    )
    .limit(1);
  return row ? asElectricityInvoiceRow(row) : null;
}
