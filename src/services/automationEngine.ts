/**
 * PG Automation Engine — observe existing tables, emit events, queue & send messages.
 * Does NOT compute billing amounts; reads snapshots from callers or existing invoice rows.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { computeRentDuePaise } from '@/src/services/rentInvoices';
import {
  automationActions,
  automationEvents,
  bedReservations,
  beds,
  bookings,
  customers,
  electricityBills,
  electricityInvoices,
  floors,
  pgs,
  rentInvoices,
  rooms,
  vacatingRequests,
  type AutomationEventType,
} from '@/src/db/schema';
import { AUTOMATION_RULES } from '@/src/lib/automation/rules';
import {
  renderAutomationTemplate,
  type AutomationTemplateContext,
} from '@/src/lib/automation/templates';
import { addDays, formatDate, parseDate, todayString } from '@/src/lib/dates';
import { env } from '@/src/lib/env';
import { logEmailDelivery } from '@/src/lib/email/deliveryLog';
import { sendEmail } from '@/src/lib/email/send';
import { whatsAppPhoneDigits } from '@/src/lib/kyc/adminWhatsApp';

function pgErrorCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code: unknown }).code);
  }
  return null;
}

export type EmitAutomationEventInput = {
  eventType: AutomationEventType;
  pgId: string;
  customerId?: string | null;
  bookingId?: string | null;
  triggerDate?: Date;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
};

function templateContextFromMetadata(
  metadata: Record<string, unknown>,
): AutomationTemplateContext {
  return {
    name: String(metadata.customerName ?? metadata.name ?? 'there'),
    pgName: String(metadata.pgName ?? 'your PG'),
    amountPaise:
      typeof metadata.amountPaise === 'number' ? metadata.amountPaise : undefined,
    dueDate: metadata.dueDate ? String(metadata.dueDate) : undefined,
    vacatingDate: metadata.vacatingDate ? String(metadata.vacatingDate) : undefined,
    checkinDate: metadata.checkinDate ? String(metadata.checkinDate) : undefined,
    checkoutDate: metadata.checkoutDate ? String(metadata.checkoutDate) : undefined,
    paymentPurpose: metadata.paymentPurpose ? String(metadata.paymentPurpose) : undefined,
  };
}

/** Step 1 + 2: record event and queue actions from rules. */
export async function emitAutomationEvent(
  input: EmitAutomationEventInput,
): Promise<{ ok: true; eventId: string } | { ok: false; reason: string }> {
  try {
    const [event] = await db
      .insert(automationEvents)
      .values({
        pgId: input.pgId,
        customerId: input.customerId ?? null,
        bookingId: input.bookingId ?? null,
        eventType: input.eventType,
        triggerDate: input.triggerDate ?? new Date(),
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
        status: 'pending',
      })
      .returning({ id: automationEvents.id });

    if (!event) return { ok: false, reason: 'Could not create automation event.' };

    const ctx = templateContextFromMetadata(input.metadata ?? {});
    const plans = AUTOMATION_RULES[input.eventType];

    for (const plan of plans) {
      const { subject, body } = renderAutomationTemplate(plan.templateType, ctx);
      const message = plan.channel === 'email' ? `${subject}\n\n${body}` : body;
      await db.insert(automationActions).values({
        eventId: event.id,
        channel: plan.channel,
        recipient: plan.recipient,
        templateType: plan.templateType,
        message,
        status: 'queued',
        metadata: { subject },
      });
    }

    await db
      .update(automationEvents)
      .set({ status: 'processed' })
      .where(eq(automationEvents.id, event.id));

    return { ok: true, eventId: event.id };
  } catch (err) {
    if (pgErrorCode(err) === '23505') {
      return { ok: false, reason: 'duplicate' };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message };
  }
}

export function queueAutomationEvent(input: EmitAutomationEventInput): void {
  void emitAutomationEvent(input).catch((err) => {
    console.error('[automation] emit failed:', err);
  });
}

async function resolveCustomerEmail(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const [row] = await db
    .select({ email: customers.email })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  return row?.email?.trim() || null;
}

async function resolveCustomerPhone(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const [row] = await db
    .select({ phone: customers.phone })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  return row?.phone?.trim() || null;
}

async function executeAction(
  action: typeof automationActions.$inferSelect,
  event: typeof automationEvents.$inferSelect,
): Promise<void> {
  const meta = (event.metadata ?? {}) as Record<string, unknown>;
  const customerId = event.customerId;

  if (action.channel === 'email') {
    let to: string | null = null;
    if (action.recipient === 'resident') {
      to = await resolveCustomerEmail(customerId);
    } else if (action.recipient === 'admin' || action.recipient === 'owner') {
      to = env.ADMIN_NOTIFICATION_EMAIL ?? null;
    }

    if (!to) {
      await db
        .update(automationActions)
        .set({
          status: 'failed',
          errorMessage: 'No recipient email configured',
        })
        .where(eq(automationActions.id, action.id));
      return;
    }

    const subject =
      typeof (action.metadata as Record<string, unknown>)?.subject === 'string'
        ? String((action.metadata as Record<string, unknown>).subject)
        : 'Awesome PG update';

    const result = await sendEmail({
      to,
      subject,
      text: action.message,
    });

    await db
      .update(automationActions)
      .set({
        status: result.ok ? 'sent' : 'failed',
        sentAt: result.ok ? new Date() : null,
        errorMessage: result.ok ? null : result.message,
      })
      .where(eq(automationActions.id, action.id));

    if (customerId) {
      await logEmailDelivery({
        recipientEmail: to,
        recipientKind: action.recipient === 'resident' ? 'tenant' : 'admin_copy',
        subject,
        notificationKind: `automation:${action.templateType}`,
        customerId,
        status: result.ok ? 'sent' : 'failed',
        provider: result.ok ? result.provider : undefined,
        messageId: result.ok ? result.messageId : undefined,
        errorMessage: result.ok ? undefined : result.message,
      });
    }
    return;
  }

  if (action.channel === 'whatsapp') {
    const phone = await resolveCustomerPhone(customerId);
    const digits = phone ? whatsAppPhoneDigits(phone) : null;
    if (!digits) {
      await db
        .update(automationActions)
        .set({
          status: 'failed',
          errorMessage: 'No valid WhatsApp phone for resident',
        })
        .where(eq(automationActions.id, action.id));
      return;
    }

    const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(action.message)}`;
    const apiConfigured = Boolean(process.env.TWILIO_ACCOUNT_SID?.trim());

    if (!apiConfigured) {
      await db
        .update(automationActions)
        .set({
          status: 'queued',
          metadata: { ...(action.metadata as object), whatsappUrl: waUrl },
          errorMessage: 'WhatsApp API not configured — deeplink stored for manual send',
        })
        .where(eq(automationActions.id, action.id));
      return;
    }

    // Placeholder for Twilio / Meta Cloud API — mark failed until wired.
    await db
      .update(automationActions)
      .set({
        status: 'failed',
        metadata: { whatsappUrl: waUrl },
        errorMessage: 'WhatsApp API integration pending',
      })
      .where(eq(automationActions.id, action.id));
    return;
  }

  await db
    .update(automationActions)
    .set({ status: 'failed', errorMessage: 'SMS channel not configured' })
    .where(eq(automationActions.id, action.id));
}

/** Step 3: send queued actions. */
export async function processQueuedAutomationActions(limit = 50): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const rows = await db
    .select({
      action: automationActions,
      event: automationEvents,
    })
    .from(automationActions)
    .innerJoin(automationEvents, eq(automationEvents.id, automationActions.eventId))
    .where(eq(automationActions.status, 'queued'))
    .orderBy(automationActions.createdAt)
    .limit(limit);

  let sent = 0;
  let failed = 0;

  for (const { action, event } of rows) {
    await executeAction(action, event);
    const [updated] = await db
      .select({ status: automationActions.status })
      .from(automationActions)
      .where(eq(automationActions.id, action.id))
      .limit(1);
    if (updated?.status === 'sent') sent += 1;
    if (updated?.status === 'failed') failed += 1;
  }

  return { processed: rows.length, sent, failed };
}

async function pgIdForBooking(bookingId: string): Promise<string | null> {
  const [row] = await db
    .select({ pgId: floors.pgId })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.kind, 'primary')),
    )
    .limit(1);
  return row?.pgId ?? null;
}

/** Step 1 (scheduled): scan existing tables and emit deduplicated events. */
export async function detectAutomationEvents(): Promise<{ emitted: number; skipped: number }> {
  const today = todayString();
  const inTwoDays = formatDate(addDays(parseDate(today), 2));
  const inSevenDays = formatDate(addDays(parseDate(today), 7));
  const inThreeDays = formatDate(addDays(parseDate(today), 3));

  let emitted = 0;
  let skipped = 0;

  async function tryEmit(input: EmitAutomationEventInput) {
    const result = await emitAutomationEvent(input);
    if (result.ok) emitted += 1;
    else if (result.reason === 'duplicate') skipped += 1;
  }

  const rentDueRows = await db
    .select({
      id: rentInvoices.id,
      pgId: rentInvoices.pgId,
      customerId: rentInvoices.customerId,
      bookingId: rentInvoices.bookingId,
      dueDate: rentInvoices.dueDate,
      rentPaise: rentInvoices.rentPaise,
      discountPaise: rentInvoices.discountPaise,
      customerName: customers.fullName,
      pgName: pgs.name,
    })
    .from(rentInvoices)
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .innerJoin(pgs, eq(pgs.id, rentInvoices.pgId))
    .where(and(eq(rentInvoices.status, 'pending'), eq(rentInvoices.dueDate, inTwoDays)));

  for (const row of rentDueRows) {
    await tryEmit({
      eventType: 'rent_due',
      pgId: row.pgId,
      customerId: row.customerId,
      bookingId: row.bookingId,
      idempotencyKey: `rent_due:${row.id}:${inTwoDays}`,
      metadata: {
        customerName: row.customerName,
        pgName: row.pgName,
        amountPaise: computeRentDuePaise(row.rentPaise, row.discountPaise),
        dueDate: row.dueDate,
      },
    });
  }

  const rentOverdueRows = await db
    .select({
      id: rentInvoices.id,
      pgId: rentInvoices.pgId,
      customerId: rentInvoices.customerId,
      bookingId: rentInvoices.bookingId,
      rentPaise: rentInvoices.rentPaise,
      discountPaise: rentInvoices.discountPaise,
      customerName: customers.fullName,
      pgName: pgs.name,
    })
    .from(rentInvoices)
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .innerJoin(pgs, eq(pgs.id, rentInvoices.pgId))
    .where(eq(rentInvoices.status, 'overdue'));

  for (const row of rentOverdueRows) {
    await tryEmit({
      eventType: 'rent_overdue',
      pgId: row.pgId,
      customerId: row.customerId,
      bookingId: row.bookingId,
      idempotencyKey: `rent_overdue:${row.id}:${today}`,
      metadata: {
        customerName: row.customerName,
        pgName: row.pgName,
        amountPaise: computeRentDuePaise(row.rentPaise, row.discountPaise),
      },
    });
  }

  const elecDueRows = await db
    .select({
      id: electricityInvoices.id,
      pgId: electricityBills.pgId,
      customerId: electricityInvoices.customerId,
      bookingId: electricityInvoices.bookingId,
      dueDate: electricityInvoices.dueDate,
      amountPaise: electricityInvoices.amountPaise,
      customerName: customers.fullName,
      pgName: pgs.name,
    })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .innerJoin(pgs, eq(pgs.id, electricityBills.pgId))
    .where(
      and(
        eq(electricityInvoices.status, 'pending'),
        eq(electricityInvoices.dueDate, inTwoDays),
      ),
    );

  for (const row of elecDueRows) {
    await tryEmit({
      eventType: 'electricity_due',
      pgId: row.pgId,
      customerId: row.customerId,
      bookingId: row.bookingId,
      idempotencyKey: `electricity_due:${row.id}:${inTwoDays}`,
      metadata: {
        customerName: row.customerName,
        pgName: row.pgName,
        amountPaise: row.amountPaise,
        dueDate: row.dueDate,
      },
    });
  }

  const elecOverdueRows = await db
    .select({
      id: electricityInvoices.id,
      pgId: electricityBills.pgId,
      customerId: electricityInvoices.customerId,
      bookingId: electricityInvoices.bookingId,
      amountPaise: electricityInvoices.amountPaise,
      customerName: customers.fullName,
      pgName: pgs.name,
    })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .innerJoin(pgs, eq(pgs.id, electricityBills.pgId))
    .where(
      and(
        eq(electricityInvoices.status, 'pending'),
        sql`${electricityInvoices.dueDate} < ${today}::date`,
      ),
    );

  for (const row of elecOverdueRows) {
    await tryEmit({
      eventType: 'electricity_overdue',
      pgId: row.pgId,
      customerId: row.customerId,
      bookingId: row.bookingId,
      idempotencyKey: `electricity_overdue:${row.id}:${today}`,
      metadata: {
        customerName: row.customerName,
        pgName: row.pgName,
        amountPaise: row.amountPaise,
      },
    });
  }

  const vacatingRows = await db
    .select({
      id: vacatingRequests.id,
      bookingId: vacatingRequests.bookingId,
      customerId: vacatingRequests.customerId,
      vacatingDate: vacatingRequests.vacatingDate,
      customerName: customers.fullName,
    })
    .from(vacatingRequests)
    .innerJoin(customers, eq(customers.id, vacatingRequests.customerId))
    .where(
      and(
        eq(vacatingRequests.vacatingDate, inSevenDays),
        sql`${vacatingRequests.status} IN ('pending', 'approved')`,
      ),
    );

  for (const row of vacatingRows) {
    const pgId = await pgIdForBooking(row.bookingId);
    if (!pgId) continue;
    const [pgRow] = await db
      .select({ name: pgs.name })
      .from(pgs)
      .where(eq(pgs.id, pgId))
      .limit(1);
    await tryEmit({
      eventType: 'vacating_notice',
      pgId,
      customerId: row.customerId,
      bookingId: row.bookingId,
      idempotencyKey: `vacating_notice:${row.id}:${inSevenDays}`,
      metadata: {
        customerName: row.customerName,
        pgName: pgRow?.name ?? 'PG',
        vacatingDate: row.vacatingDate,
      },
    });
  }

  const kycRows = await db
    .select({
      customerId: customers.id,
      bookingId: bookings.id,
      customerName: customers.fullName,
      pgId: floors.pgId,
      pgName: pgs.name,
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
        eq(bookings.status, 'confirmed'),
        eq(bedReservations.status, 'active'),
        sql`${customers.kycStatus} IN ('pending', 'rejected')`,
        sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
      ),
    );

  for (const row of kycRows) {
    await tryEmit({
      eventType: 'kyc_pending',
      pgId: row.pgId,
      customerId: row.customerId,
      bookingId: row.bookingId,
      idempotencyKey: `kyc_pending:${row.customerId}:${today}`,
      metadata: { customerName: row.customerName, pgName: row.pgName },
    });
  }

  const checkinRows = await db
    .select({
      bookingId: bedReservations.bookingId,
      customerId: bookings.customerId,
      customerName: customers.fullName,
      pgId: floors.pgId,
      pgName: pgs.name,
      startDate: sql<string>`lower(${bedReservations.stayRange})::text`,
    })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(bedReservations.kind, 'primary'),
        eq(bedReservations.status, 'active'),
        sql`lower(${bedReservations.stayRange})::date = ${inThreeDays}::date`,
      ),
    );

  for (const row of checkinRows) {
    await tryEmit({
      eventType: 'checkin',
      pgId: row.pgId,
      customerId: row.customerId,
      bookingId: row.bookingId,
      idempotencyKey: `checkin:${row.bookingId}:${inThreeDays}`,
      metadata: {
        customerName: row.customerName,
        pgName: row.pgName,
        checkinDate: row.startDate,
      },
    });
  }

  const depositRefundRows = await db
    .select({
      bookingId: bookings.id,
      customerId: bookings.customerId,
      depositPaise: bookings.depositPaise,
      customerName: customers.fullName,
      pgId: floors.pgId,
      pgName: pgs.name,
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
        eq(bookings.adminDepositRefundStatus, 'pending'),
        eq(bedReservations.kind, 'primary'),
      ),
    );

  for (const row of depositRefundRows) {
    await tryEmit({
      eventType: 'deposit_pending_refund',
      pgId: row.pgId,
      customerId: row.customerId,
      bookingId: row.bookingId,
      idempotencyKey: `deposit_refund:${row.bookingId}:${today}`,
      metadata: {
        customerName: row.customerName,
        pgName: row.pgName,
        amountPaise: row.depositPaise,
      },
    });
  }

  const { markOverdueDeposits, listOutstandingDeposits } = await import('./depositCollection');
  await markOverdueDeposits();
  const inOneDay = formatDate(addDays(parseDate(today), 1));
  const depositDueRows = await listOutstandingDeposits();

  for (const row of depositDueRows) {
    if (row.depositDueDate === inSevenDays) {
      await tryEmit({
        eventType: 'deposit_collection_due',
        pgId: row.pgId,
        customerId: row.customerId,
        bookingId: row.bookingId,
        idempotencyKey: `deposit_due_7d:${row.bookingId}:${inSevenDays}`,
        metadata: {
          customerName: row.customerFullName,
          pgName: row.pgName,
          amountPaise: row.depositDuePaise,
          dueDate: row.depositDueDate,
        },
      });
    }
    if (row.depositDueDate === inOneDay) {
      await tryEmit({
        eventType: 'deposit_collection_due',
        pgId: row.pgId,
        customerId: row.customerId,
        bookingId: row.bookingId,
        idempotencyKey: `deposit_due_1d:${row.bookingId}:${inOneDay}`,
        metadata: {
          customerName: row.customerFullName,
          pgName: row.pgName,
          amountPaise: row.depositDuePaise,
          dueDate: row.depositDueDate,
        },
      });
    }
    if (row.depositCollectionStatus === 'overdue') {
      await tryEmit({
        eventType: 'deposit_collection_overdue',
        pgId: row.pgId,
        customerId: row.customerId,
        bookingId: row.bookingId,
        idempotencyKey: `deposit_overdue:${row.bookingId}:${today}`,
        metadata: {
          customerName: row.customerFullName,
          pgName: row.pgName,
          amountPaise: row.depositDuePaise,
          dueDate: row.depositDueDate,
        },
      });
    }
  }

  return { emitted, skipped };
}

export async function emitPaymentReceivedAutomation(input: {
  pgId: string;
  customerId: string;
  bookingId?: string | null;
  paymentId: string;
  amountPaise: number;
  pgName: string;
  customerName: string;
  paymentPurpose?: string;
}): Promise<void> {
  queueAutomationEvent({
    eventType: 'payment_received',
    pgId: input.pgId,
    customerId: input.customerId,
    bookingId: input.bookingId ?? null,
    idempotencyKey: `payment_received:${input.paymentId}`,
    metadata: {
      pgName: input.pgName,
      customerName: input.customerName,
      amountPaise: input.amountPaise,
      paymentPurpose: input.paymentPurpose,
    },
  });
  void processQueuedAutomationActions(10);
}
