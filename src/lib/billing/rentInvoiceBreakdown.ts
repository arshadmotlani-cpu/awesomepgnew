/**
 * Rent invoice transparency SSOT — single builder for resident + admin UI.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  beds,
  financialInvoices,
  rentInvoices,
  rooms,
} from '@/src/db/schema';
import type { InvoiceBreakdown } from '@/src/db/schema/financialInvoices';
import { parseDate } from '@/src/lib/dates';
import { getRoomBillingConfigForBed } from '@/src/lib/billing/roomBilling';
import {
  resolveMonthlyRentPaiseForBooking,
  type RentPricingSource,
} from '@/src/lib/billing/rentPricingSsot';
import type {
  RentInvoiceBreakdown,
  RentInvoiceProration,
} from '@/src/lib/billing/rentInvoiceBreakdownTypes';
import { projectInvoice } from '@/src/services/rentInvoices';

function monthLabel(billingMonth: string): string {
  const d = parseDate(billingMonth);
  return d.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function parseBillingPeriodFromNotes(notes: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/Billing period:\s*(.+)/i);
  return match?.[1]?.trim() ?? null;
}

async function resolveRentInvoiceProration(
  invoice: typeof rentInvoices.$inferSelect,
  _monthlyRentPaise: number,
): Promise<RentInvoiceProration | null> {
  // Anniversary billing — no proration breakdown for normal invoices.
  if (parseBillingPeriodFromNotes(invoice.notes)) return null;
  if (invoice.notes?.includes('Pro-rated:')) return null;
  return null;
}

function discountsAndCreditsFromBreakdown(
  breakdown: InvoiceBreakdown | null | undefined,
): { discountsPaise: number; creditsPaise: number; previousBalancePaise: number } {
  if (!breakdown) {
    return { discountsPaise: 0, creditsPaise: 0, previousBalancePaise: 0 };
  }
  let discountsPaise = 0;
  let creditsPaise = 0;
  for (const line of breakdown.lines ?? []) {
    if (line.amountPaise < 0) {
      if (line.kind === 'credit' || line.label.toLowerCase().includes('credit')) {
        creditsPaise += Math.abs(line.amountPaise);
      } else {
        discountsPaise += Math.abs(line.amountPaise);
      }
    }
  }
  return {
    discountsPaise,
    creditsPaise,
    previousBalancePaise: 0,
  };
}

export function buildRentInvoiceBreakdownFromContext(input: {
  invoice: typeof rentInvoices.$inferSelect;
  roomNumber: string;
  bedCode: string;
  monthlyRentPaise: number;
  rentPricingSource: RentPricingSource;
  isPrivateRoom: boolean;
  financialBreakdown?: InvoiceBreakdown | null;
  proration?: RentInvoiceProration | null;
  asOf?: string;
}): RentInvoiceBreakdown {
  const projected = projectInvoice(input.invoice, input.asOf);
  const { discountsPaise, creditsPaise, previousBalancePaise } =
    discountsAndCreditsFromBreakdown(input.financialBreakdown);

  const proration =
    input.proration !== undefined
      ? input.proration
      : null;

  const billingPeriodLabel = parseBillingPeriodFromNotes(input.invoice.notes);
  const billingMonthLabel = billingPeriodLabel ?? monthLabel(input.invoice.billingMonth);

  const occupancyLabel = input.isPrivateRoom
    ? 'Private room · 1 resident'
    : 'Per-bed monthly rent';

  return {
    version: 1,
    invoiceId: input.invoice.id,
    invoiceNumber: input.invoice.invoiceNumber,
    billingMonth: input.invoice.billingMonth,
    billingMonthLabel,
    dueDate: input.invoice.dueDate,
    roomNumber: input.roomNumber,
    bedCode: input.bedCode,
    monthlyRentPaise: input.monthlyRentPaise,
    rentPricingSource: input.rentPricingSource,
    discountsPaise,
    creditsPaise,
    previousBalancePaise,
    finalRentPaise: input.invoice.rentPaise,
    lateFeePaise: projected.accruedLateFeePaise,
    paidPrincipalPaise: input.invoice.paidPrincipalPaise,
    paidLateFeePaise: input.invoice.paidLateFeePaise,
    balanceDuePaise: projected.outstandingPaise,
    isPrivateRoom: input.isPrivateRoom,
    occupancyLabel,
    proration,
    notes: input.invoice.notes,
    generatedAt: new Date().toISOString(),
  };
}

/** Load rent invoice + SSOT pricing and build transparent breakdown. */
export async function loadRentInvoiceBreakdown(
  invoiceId: string,
  asOf?: string,
): Promise<RentInvoiceBreakdown | null> {
  const [row] = await db
    .select({
      invoice: rentInvoices,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
    })
    .from(rentInvoices)
    .innerJoin(beds, eq(beds.id, rentInvoices.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(eq(rentInvoices.id, invoiceId))
    .limit(1);

  if (!row) return null;

  const resolved = await resolveMonthlyRentPaiseForBooking(
    row.invoice.bookingId,
    row.invoice.billingMonth,
  );
  const roomConfig = await getRoomBillingConfigForBed(row.invoice.bedId);
  const isPrivateRoom = roomConfig?.billingMode === 'private_room';

  const [financial] = await db
    .select({ breakdown: financialInvoices.breakdown })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.sourceId, invoiceId),
        eq(financialInvoices.sourceTable, 'rent_invoices'),
      ),
    )
    .limit(1);

  const proration = await resolveRentInvoiceProration(row.invoice, resolved.rentPaise);

  return buildRentInvoiceBreakdownFromContext({
    invoice: row.invoice,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    monthlyRentPaise: resolved.rentPaise,
    rentPricingSource: resolved.source,
    isPrivateRoom,
    financialBreakdown: (financial?.breakdown as InvoiceBreakdown | null) ?? null,
    proration,
    asOf,
  });
}
