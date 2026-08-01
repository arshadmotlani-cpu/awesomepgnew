/**
 * Resident portal financial SSOT — all resident-facing amounts must come from here.
 * Invoice generation / resolveMonthlyRentPaiseForBooking is the rent authority.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { rentInvoices } from '@/src/db/schema';
import { resolveMonthlyRentPaiseForBooking } from '@/src/lib/billing/rentPricingSsot';
import { loadMonthlyBillingSnapshotForBooking } from '@/src/lib/billing/monthlyBillingSnapshot';
import { formatDate, parseDate, todayString } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';
import {
  ensureBillingProfileForBooking,
  getResidentBillingFormDefaults,
} from '@/src/services/residentBillingProfiles';
import { evaluateAnniversaryRentGenerationEligibility } from '@/src/services/rentInvoices';

export type ResidentMonthlyRentDisplay = {
  monthlyRentPaise: number;
  billingCycleLabel: string;
  nextRentDueDate: string | null;
};

export type PendingRentGenerationNotice = {
  generationDate: string;
  message: string;
};

const VISIBLE_INVOICE_STATUSES = new Set([
  'pending',
  'paid',
  'partial',
  'overdue',
  'payment_in_progress',
  'expired',
]);

export function isVisibleResidentInvoiceStatus(status: string): boolean {
  return VISIBLE_INVOICE_STATUSES.has(status);
}

export function isCancelledResidentInvoiceStatus(status: string): boolean {
  return status === 'cancelled';
}

/** Canonical monthly rent for resident UI — matches invoice generation SSOT. */
export async function resolveResidentMonthlyRentPaise(bookingId: string): Promise<number> {
  const billingMonth = firstOfMonth(todayString());
  const resolved = await resolveMonthlyRentPaiseForBooking(bookingId, billingMonth);
  return resolved.rentPaise;
}

/** Monthly rent + billing cycle label from invoice-engine-aligned snapshot. */
export async function loadResidentMonthlyRentDisplay(args: {
  bookingId: string;
  customerId: string;
}): Promise<ResidentMonthlyRentDisplay | null> {
  const snapshot = await loadMonthlyBillingSnapshotForBooking({
    bookingId: args.bookingId,
    customerId: args.customerId,
  });
  if (!snapshot) {
    const monthlyRentPaise = await resolveResidentMonthlyRentPaise(args.bookingId);
    if (monthlyRentPaise <= 0) return null;
    return {
      monthlyRentPaise,
      billingCycleLabel: 'Monthly',
      nextRentDueDate: null,
    };
  }
  return {
    monthlyRentPaise: snapshot.monthlyRentPaise,
    billingCycleLabel: snapshot.billingCycleLabel,
    nextRentDueDate: snapshot.nextRentDueDate,
  };
}

/**
 * When the current billing month's invoice is not issued yet and the anniversary
 * has not arrived, explain when generation will happen — not "missing invoice".
 */
export async function loadPendingRentGenerationNotice(args: {
  bookingId: string;
  customerId: string;
}): Promise<PendingRentGenerationNotice | null> {
  const billingMonth = firstOfMonth(todayString());
  const today = todayString();

  const [existingInvoice] = await db
    .select({ id: rentInvoices.id, status: rentInvoices.status })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, args.bookingId),
        eq(rentInvoices.customerId, args.customerId),
        eq(rentInvoices.isAdhoc, false),
        eq(rentInvoices.billingMonth, billingMonth),
        sql`${rentInvoices.status} != 'cancelled'`,
      ),
    )
    .orderBy(desc(rentInvoices.createdAt))
    .limit(1);

  if (existingInvoice) return null;

  const eligibility = await evaluateAnniversaryRentGenerationEligibility({
    bookingId: args.bookingId,
    billingMonth,
    customerId: args.customerId,
    asOf: today,
  });

  if (eligibility.eligible) return null;

  const defaults = await getResidentBillingFormDefaults(args.customerId, args.bookingId);
  const profile = await ensureBillingProfileForBooking(args.bookingId);
  if (!defaults || !profile) return null;

  const generationDate =
    defaults.nextRentDueDate >= today ? defaults.nextRentDueDate : null;
  if (!generationDate) return null;

  const formatted = formatDate(parseDate(generationDate));
  return {
    generationDate,
    message: `Your next rent invoice will be generated on ${formatted}.`,
  };
}
