/**
 * Rent invoice transparency SSOT — single builder for resident + admin UI.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  financialInvoices,
  rentInvoices,
  rooms,
} from '@/src/db/schema';
import type { InvoiceBreakdown } from '@/src/db/schema/financialInvoices';
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import { getRoomBillingConfigForBed } from '@/src/lib/billing/roomBilling';
import {
  resolveMonthlyRentPaiseForBooking,
  type RentPricingSource,
} from '@/src/lib/billing/rentPricingSsot';
import type {
  RentInvoiceBreakdown,
  RentInvoiceProration,
} from '@/src/lib/billing/rentInvoiceBreakdownTypes';
import { monthBounds, prorateForMonth } from '@/src/services/billing';
import { projectInvoice } from '@/src/services/rentInvoices';

function monthLabel(billingMonth: string): string {
  const d = parseDate(billingMonth);
  return d.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function parseProrationFromNotes(
  notes: string | null,
  monthlyRentPaise: number,
  finalRentPaise: number,
): RentInvoiceProration | null {
  if (!notes) return null;
  const match = notes.match(/Pro-rated:\s*(\d+)\/(\d+)\s*days active/i);
  if (!match) return null;
  const daysStayed = Number(match[1]);
  const daysInMonth = Number(match[2]);
  if (!Number.isFinite(daysStayed) || !Number.isFinite(daysInMonth) || daysInMonth <= 0) {
    return null;
  }
  return {
    checkInDate: null,
    checkOutDate: null,
    daysStayed,
    daysInMonth,
    monthlyRentPaise,
    calculatedSharePaise: finalRentPaise,
    amountAlreadyCollectedPaise: 0,
    remainingAmountPaise: finalRentPaise,
  };
}

/** Stay window for invoice display — includes completed reservations for past months. */
async function loadStayWindowForBooking(
  bookingId: string,
): Promise<{ start: string; end: string | null } | null> {
  const rows = await db
    .select({
      lower: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
      upper: sql<string | null>`to_char(upper(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
    })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.bookingId, bookingId),
        inArray(bedReservations.status, ['active', 'completed']),
      ),
    );
  if (rows.length === 0) return null;
  const lowers = rows.map((r) => r.lower).filter(Boolean) as string[];
  const uppers = rows.map((r) => r.upper).filter((u): u is string => !!u);
  if (lowers.length === 0) return null;
  const start = lowers.sort()[0];
  const end =
    uppers.length === rows.length ? uppers.sort().slice(-1)[0] : null;
  return { start, end };
}

async function resolveRentInvoiceProration(
  invoice: typeof rentInvoices.$inferSelect,
  monthlyRentPaise: number,
): Promise<RentInvoiceProration | null> {
  const stay = await loadStayWindowForBooking(invoice.bookingId);
  if (stay) {
    const prorated = prorateForMonth({
      monthlyRatePaise: monthlyRentPaise,
      billingMonth: invoice.billingMonth,
      activeStart: stay.start,
      activeEnd: stay.end ?? '9999-12-31',
    });
    if (!prorated.isFullMonth && prorated.daysActive > 0) {
      const { start: monthStart, end: monthEnd } = monthBounds(invoice.billingMonth);
      const aStart = parseDate(stay.start);
      const aEnd = parseDate(stay.end ?? '9999-12-31');
      const intersectStart = aStart > monthStart ? aStart : monthStart;
      const intersectEnd = aEnd < monthEnd ? aEnd : monthEnd;
      const checkInDate = formatDate(intersectStart);
      const checkOutDate =
        intersectEnd < monthEnd ? formatDate(addDays(intersectEnd, -1)) : null;

      return {
        checkInDate,
        checkOutDate,
        daysStayed: prorated.daysActive,
        daysInMonth: prorated.daysInMonth,
        monthlyRentPaise,
        calculatedSharePaise: invoice.rentPaise,
        amountAlreadyCollectedPaise: 0,
        remainingAmountPaise: invoice.rentPaise,
      };
    }
    if (prorated.isFullMonth) return null;
  }

  if (invoice.rentPaise >= monthlyRentPaise) return null;
  return parseProrationFromNotes(invoice.notes, monthlyRentPaise, invoice.rentPaise);
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
      : input.invoice.rentPaise < input.monthlyRentPaise
        ? parseProrationFromNotes(
            input.invoice.notes,
            input.monthlyRentPaise,
            input.invoice.rentPaise,
          )
        : null;

  const occupancyLabel = input.isPrivateRoom
    ? 'Private room · 1 resident'
    : 'Per-bed monthly rent';

  return {
    version: 1,
    invoiceId: input.invoice.id,
    invoiceNumber: input.invoice.invoiceNumber,
    billingMonth: input.invoice.billingMonth,
    billingMonthLabel: monthLabel(input.invoice.billingMonth),
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
