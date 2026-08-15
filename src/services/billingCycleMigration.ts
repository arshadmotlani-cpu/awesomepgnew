/**
 * Individual resident billing-cycle migration — anniversary → calendar_month_1st.
 * Never modifies check-in dates or paid historical invoices.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  checkoutSettlements,
  customers,
  floors,
  pgs,
  rentInvoices,
  residentBillingProfiles,
  rooms,
  vacatingRequests,
} from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { formatDate, parseDate, addDays, addMonths } from '@/src/lib/dates';
import {
  STANDARD_CALENDAR_BILLING_DAY,
  billingPeriodForPolicy,
  firstAutoBillingDate,
  firstOfMonth,
  lastDayOfMonth,
  prorateForMonth,
  rentInvoiceBillingPeriodNoteForPolicy,
  type BillingCyclePolicy,
} from '@/src/services/billing';
import { loadBillingCoverageModel } from '@/src/services/billingCoverage';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { resolveMonthlyRentPaiseForBooking } from '@/src/lib/billing/rentPricingSsot';
import { createAdhocRentInvoice } from '@/src/services/rentInvoices';

export type BillingCycleMigrationPreview = {
  bookingId: string;
  customerName: string;
  pgName: string;
  roomNumber: string | null;
  bedCode: string | null;
  bedId: string;
  checkInDate: string;
  currentPolicy: BillingCyclePolicy;
  currentBillingDay: number;
  targetPolicy: BillingCyclePolicy;
  targetBillingDay: number;
  monthlyRentPaise: number;
  depositHeldPaise: number;
  paidThroughDate: string | null;
  outstandingRentPaise: number;
  lastPaidInvoice: {
    id: string;
    invoiceNumber: string;
    dueDate: string;
    billingMonth: string;
    rentPaise: number;
  } | null;
  vacatingStatus: string | null;
  noticeGivenDate: string | null;
  alreadyOnTarget: boolean;
  lightweightPolicyFlip: boolean;
  blocked: boolean;
  blockedReason: string | null;
  transition: {
    periodStart: string;
    periodEnd: string;
    amountPaise: number;
    daysActive: number;
    daysInMonth: number;
    explanation: string;
    dueDate: string;
  } | null;
  firstAutoBillingDate: string;
};

export type BillingCycleMigrationApplyResult =
  | { ok: true; profileUpdated: true; transitionInvoiceId?: string }
  | { ok: false; error: string };

function maxPaidThroughDate(paidThrough: string | null, periods: { periodEnd: string }[]): string | null {
  let best = paidThrough;
  for (const p of periods) {
    if (!best || p.periodEnd > best) best = p.periodEnd;
  }
  return best;
}

function computeTransitionPeriod(args: {
  moveInDate: string;
  paidThroughDate: string | null;
  monthlyRentPaise: number;
}): BillingCycleMigrationPreview['transition'] {
  const moveIn = formatDate(parseDate(args.moveInDate));
  const paidThrough = args.paidThroughDate ? formatDate(parseDate(args.paidThroughDate)) : null;

  let transitionStart = paidThrough ? formatDate(addDays(paidThrough, 1)) : moveIn;
  if (transitionStart < moveIn) transitionStart = moveIn;

  const monthStart = firstOfMonth(transitionStart);
  if (transitionStart === monthStart) {
    return null;
  }

  const periodEnd = lastDayOfMonth(transitionStart);
  if (transitionStart > periodEnd) return null;

  const proration = prorateForMonth({
    monthlyRatePaise: args.monthlyRentPaise,
    billingMonth: monthStart,
    activeStart: transitionStart,
    activeEnd: parseDate(periodEnd),
  });

  if (proration.amountPaise <= 0) return null;

  const dueDate = formatDate(addDays(parseDate(monthStart), STANDARD_CALENDAR_BILLING_DAY - 1));
  const explanation = `Prorated transition rent for ${proration.daysActive}/${proration.daysInMonth} days (${transitionStart} → ${periodEnd}) before 1st-of-month billing.`;

  return {
    periodStart: transitionStart,
    periodEnd: periodEnd,
    amountPaise: proration.amountPaise,
    daysActive: proration.daysActive,
    daysInMonth: proration.daysInMonth,
    explanation,
    dueDate,
  };
}

async function loadBookingMigrationContext(bookingId: string) {
  const [ctx] = await db
    .select({
      bookingId: bookings.id,
      customerId: bookings.customerId,
      customerName: customers.fullName,
      pgId: pgs.id,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      bedId: beds.id,
      durationMode: bookings.durationMode,
      stayType: bookings.stayType,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bedReservations.kind, 'primary'),
        eq(bedReservations.status, 'active'),
      ),
    )
    .limit(1);

  const [stayRow] = await db
    .select({
      moveIn: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
    })
    .from(bedReservations)
    .where(and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.kind, 'primary')))
    .orderBy(desc(bedReservations.createdAt))
    .limit(1);

  const [profile] = await db
    .select()
    .from(residentBillingProfiles)
    .where(eq(residentBillingProfiles.bookingId, bookingId))
    .limit(1);

  const [vacating] = await db
    .select({
      status: vacatingRequests.status,
      noticeGivenDate: vacatingRequests.noticeGivenDate,
    })
    .from(vacatingRequests)
    .where(eq(vacatingRequests.bookingId, bookingId))
    .orderBy(desc(vacatingRequests.createdAt))
    .limit(1);

  const [settlement] = await db
    .select({
      status: checkoutSettlements.status,
      amountsLocked: checkoutSettlements.amountsLocked,
    })
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.bookingId, bookingId))
    .orderBy(desc(checkoutSettlements.createdAt))
    .limit(1);

  const [lastPaid] = await db
    .select({
      id: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      dueDate: rentInvoices.dueDate,
      billingMonth: rentInvoices.billingMonth,
      rentPaise: rentInvoices.rentPaise,
    })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, bookingId),
        eq(rentInvoices.status, 'paid'),
        eq(rentInvoices.isAdhoc, false),
      ),
    )
    .orderBy(desc(rentInvoices.billingMonth), desc(rentInvoices.dueDate))
    .limit(1);

  return {
    ctx,
    moveInDate: stayRow?.moveIn ?? null,
    profile,
    vacating,
    settlement,
    lastPaid: lastPaid ?? null,
  };
}

export async function previewBillingCycleMigration(
  bookingId: string,
  targetPolicy: BillingCyclePolicy = 'calendar_month_1st',
): Promise<BillingCycleMigrationPreview | { ok: false; error: string }> {
  const loaded = await loadBookingMigrationContext(bookingId);
  if (!loaded.ctx || !loaded.moveInDate) {
    return { ok: false, error: 'Active booking or check-in date not found.' };
  }

  const currentPolicy = (loaded.profile?.billingCyclePolicy ?? 'anniversary') as BillingCyclePolicy;
  const currentBillingDay = loaded.profile?.billingDay ?? 5;
  const checkInDate = loaded.moveInDate;

  const billingMonth = firstOfMonth(new Date());
  const resolved = await resolveMonthlyRentPaiseForBooking(bookingId, billingMonth);
  const monthlyRentPaise = resolved.rentPaise;

  const deposit = await getDepositSummaryForBooking(bookingId);
  const money = await getBookingMoneyBalances(bookingId);

  const coverage = await loadBillingCoverageModel({
    bookingId,
    monthlyRentPaise,
    stayType: loaded.ctx.stayType,
    durationMode: loaded.ctx.durationMode,
  });

  const paidThroughDate = maxPaidThroughDate(
    coverage?.paidUntilDate ?? null,
    coverage?.paidInvoiceCoverage ?? [],
  );

  const alreadyOnTarget =
    currentPolicy === targetPolicy && currentBillingDay === STANDARD_CALENDAR_BILLING_DAY;

  const lightweightPolicyFlip =
    currentPolicy === 'anniversary' &&
    currentBillingDay === STANDARD_CALENDAR_BILLING_DAY &&
    targetPolicy === 'calendar_month_1st';

  let blocked = false;
  let blockedReason: string | null = null;
  if (loaded.settlement?.amountsLocked) {
    blocked = true;
    blockedReason = 'Checkout settlement amounts are locked.';
  } else if (
    loaded.settlement &&
    !['refund_completed', 'cancelled'].includes(loaded.settlement.status)
  ) {
    blocked = true;
    blockedReason = `Active checkout settlement (${loaded.settlement.status}).`;
  }

  const transitionStartAnchor = paidThroughDate
    ? formatDate(addDays(paidThroughDate, 1))
    : checkInDate;
  const firstAuto = firstAutoBillingDate(
    transitionStartAnchor === firstOfMonth(transitionStartAnchor)
      ? transitionStartAnchor
      : formatDate(addMonths(firstOfMonth(transitionStartAnchor), 1)),
    STANDARD_CALENDAR_BILLING_DAY,
  );

  const transition =
    alreadyOnTarget || lightweightPolicyFlip
      ? null
      : computeTransitionPeriod({
          moveInDate: checkInDate,
          paidThroughDate,
          monthlyRentPaise,
        });

  return {
    bookingId,
    customerName: loaded.ctx.customerName,
    pgName: loaded.ctx.pgName,
    roomNumber: loaded.ctx.roomNumber,
    bedCode: loaded.ctx.bedCode,
    bedId: loaded.ctx.bedId,
    checkInDate,
    currentPolicy,
    currentBillingDay,
    targetPolicy,
    targetBillingDay: STANDARD_CALENDAR_BILLING_DAY,
    monthlyRentPaise,
    depositHeldPaise: deposit?.refundableBalancePaise ?? 0,
    paidThroughDate,
    outstandingRentPaise: money?.rent.outstandingPaise ?? 0,
    lastPaidInvoice: loaded.lastPaid,
    vacatingStatus: loaded.vacating?.status ?? null,
    noticeGivenDate: loaded.vacating?.noticeGivenDate
      ? formatDate(parseDate(loaded.vacating.noticeGivenDate))
      : null,
    alreadyOnTarget,
    lightweightPolicyFlip,
    blocked,
    blockedReason,
    transition,
    firstAutoBillingDate: firstAuto,
  };
}

export async function applyBillingCycleMigration(
  session: AdminSession,
  input: {
    bookingId: string;
    note?: string;
    createTransitionInvoice?: boolean;
    targetPolicy?: BillingCyclePolicy;
  },
): Promise<BillingCycleMigrationApplyResult> {
  const preview = await previewBillingCycleMigration(
    input.bookingId,
    input.targetPolicy ?? 'calendar_month_1st',
  );
  if ('ok' in preview && preview.ok === false) {
    return { ok: false, error: preview.error };
  }
  const p = preview as BillingCycleMigrationPreview;

  if (p.blocked) {
    return { ok: false, error: p.blockedReason ?? 'Migration blocked.' };
  }
  if (p.alreadyOnTarget) {
    return { ok: false, error: 'Resident is already on 1st-of-month billing.' };
  }

  const loaded = await loadBookingMigrationContext(input.bookingId);
  if (!loaded.ctx) return { ok: false, error: 'Booking not found.' };
  if (
    !adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, loaded.ctx.pgId)
  ) {
    return { ok: false, error: 'Access denied.' };
  }

  const note = input.note?.trim() || 'Admin billing cycle migration to calendar month 1st.';
  const transitionStartAnchor = p.paidThroughDate
    ? formatDate(addDays(p.paidThroughDate, 1))
    : p.checkInDate;
  const firstAuto = firstAutoBillingDate(
    transitionStartAnchor === firstOfMonth(transitionStartAnchor)
      ? transitionStartAnchor
      : formatDate(addMonths(firstOfMonth(transitionStartAnchor), 1)),
    STANDARD_CALENDAR_BILLING_DAY,
  );

  await db
    .update(residentBillingProfiles)
    .set({
      billingCyclePolicy: p.targetPolicy,
      billingDay: STANDARD_CALENDAR_BILLING_DAY,
      firstAutoBillingDate: firstAuto,
      billingCycleMigratedAt: new Date(),
      billingCycleMigrationNote: note,
      updatedAt: new Date(),
    })
    .where(eq(residentBillingProfiles.bookingId, input.bookingId));

  const openInvoices = await db
    .select({
      id: rentInvoices.id,
      dueDate: rentInvoices.dueDate,
      billingMonth: rentInvoices.billingMonth,
      rentPaise: rentInvoices.rentPaise,
      notes: rentInvoices.notes,
    })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, input.bookingId),
        eq(rentInvoices.isAdhoc, false),
        inArray(rentInvoices.status, ['pending', 'overdue']),
      ),
    )
    .orderBy(rentInvoices.dueDate);

  for (const inv of openInvoices) {
    const billingMonth = firstOfMonth(firstAuto);
    const dueDate = formatDate(
      addDays(parseDate(firstOfMonth(firstAuto)), STANDARD_CALENDAR_BILLING_DAY - 1),
    );
    const period = billingPeriodForPolicy('calendar_month_1st', {
      dueDate,
      billingDay: STANDARD_CALENDAR_BILLING_DAY,
      billingMonth,
    });
    const periodNote = rentInvoiceBillingPeriodNoteForPolicy(
      'calendar_month_1st',
      period.periodStart,
      period.periodEnd,
    );
    const rentPaise = p.monthlyRentPaise;
    await db
      .update(rentInvoices)
      .set({
        billingMonth,
        dueDate,
        rentPaise,
        notes: periodNote,
        updatedAt: new Date(),
      })
      .where(eq(rentInvoices.id, inv.id));
  }

  let transitionInvoiceId: string | undefined;
  if (
    input.createTransitionInvoice &&
    p.transition &&
    p.transition.amountPaise > 0 &&
    !p.lightweightPolicyFlip
  ) {
    const periodNote = rentInvoiceBillingPeriodNoteForPolicy(
      'calendar_month_1st',
      p.transition.periodStart,
      p.transition.periodEnd,
    );
    const created = await createAdhocRentInvoice({
      bookingId: input.bookingId,
      customerId: loaded.ctx.customerId,
      bedId: loaded.ctx.bedId,
      pgId: loaded.ctx.pgId,
      amountPaise: p.transition.amountPaise,
      title: 'Billing cycle transition rent',
      description: `${p.transition.explanation} ${periodNote}`,
      invoiceSubtype: 'billing_cycle_transition',
    });
    if (created.ok) {
      transitionInvoiceId = created.invoiceId;
    }
  }

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: session.adminId,
    entity: 'booking',
    entityId: input.bookingId,
    action: 'billing_cycle_migrated',
    diff: {
      fromPolicy: p.currentPolicy,
      toPolicy: p.targetPolicy,
      fromBillingDay: p.currentBillingDay,
      toBillingDay: STANDARD_CALENDAR_BILLING_DAY,
      firstAutoBillingDate: firstAuto,
      transitionInvoiceId,
      note,
      openInvoicesRealigned: openInvoices.length,
    },
  });

  return { ok: true, profileUpdated: true, transitionInvoiceId };
}

export async function generateBillingCycleTransitionInvoice(
  session: AdminSession,
  bookingId: string,
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  const preview = await previewBillingCycleMigration(bookingId);
  if ('ok' in preview && preview.ok === false) {
    return { ok: false, error: preview.error };
  }
  const p = preview as BillingCycleMigrationPreview;
  if (!p.transition || p.transition.amountPaise <= 0) {
    return { ok: false, error: 'No transition amount to bill.' };
  }

  const loaded = await loadBookingMigrationContext(bookingId);
  if (!loaded.ctx) return { ok: false, error: 'Booking not found.' };
  if (
    !adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, loaded.ctx.pgId)
  ) {
    return { ok: false, error: 'Access denied.' };
  }

  const [bedRow] = await db
    .select({ bedId: bedReservations.bedId })
    .from(bedReservations)
    .where(and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.kind, 'primary')))
    .limit(1);

  if (!bedRow?.bedId) {
    return { ok: false, error: 'Bed not found for booking.' };
  }

  const periodNote = rentInvoiceBillingPeriodNoteForPolicy(
    'calendar_month_1st',
    p.transition.periodStart,
    p.transition.periodEnd,
  );

  const created = await createAdhocRentInvoice({
    bookingId,
    customerId: loaded.ctx.customerId,
    bedId: bedRow.bedId,
    pgId: loaded.ctx.pgId,
    amountPaise: p.transition.amountPaise,
    title: 'Billing cycle transition rent',
    description: `${p.transition.explanation} ${periodNote}`,
    invoiceSubtype: 'billing_cycle_transition',
  });

  if (!created.ok) return created;

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: session.adminId,
    entity: 'booking',
    entityId: bookingId,
    action: 'billing_cycle_transition_invoice',
    diff: {
      invoiceId: created.invoiceId,
      amountPaise: p.transition.amountPaise,
      periodStart: p.transition.periodStart,
      periodEnd: p.transition.periodEnd,
    },
  });

  return { ok: true, invoiceId: created.invoiceId };
}
