/**
 * Collection reminder engine — Phase 3 scaffolding.
 * WhatsApp Phase 1 = wa.me link + delivery log (NOT Meta Cloud API).
 * Honest statuses: pending | sent_link | skipped | failed.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  collectionReminderDeliveries,
  collectionReminderPolicies,
  collectionReminderTemplates,
} from '@/src/db/schema';
import { addDays, formatDate, parseDate, type DateLike } from '@/src/lib/dates';
import { whatsAppPhoneDigits } from '@/src/lib/kyc/adminWhatsApp';
import { listAdminOpenRentInvoices } from '@/src/db/queries/admin';

function asOfIso(value?: DateLike): string {
  return formatDate(parseDate(value ?? new Date()));
}
export type ReminderAnchor = 'billing_date' | 'due_date';

export type ReminderScheduleInput = {
  offsetDays: number;
  anchor: ReminderAnchor;
  /** billing_month (1st) or invoice billing date ISO */
  billingDate: string;
  dueDate: string;
  asOf: string;
};

/** Pure: does this policy fire on asOf for the given invoice dates? */
export function reminderMatchesAsOf(input: ReminderScheduleInput): boolean {
  const anchorIso = input.anchor === 'billing_date' ? input.billingDate : input.dueDate;
  const target = formatDate(addDays(anchorIso, input.offsetDays));
  return target === input.asOf;
}

export function scheduledDateForReminder(input: {
  offsetDays: number;
  anchor: ReminderAnchor;
  billingDate: string;
  dueDate: string;
}): string {
  const anchorIso = input.anchor === 'billing_date' ? input.billingDate : input.dueDate;
  return formatDate(addDays(anchorIso, input.offsetDays));
}

export function renderReminderTemplate(
  bodyText: string,
  vars: Record<string, string>,
): string {
  return bodyText.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

export function buildWaMeUrl(phone: string, message: string): string | null {
  const digits = whatsAppPhoneDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export type DueReminderCandidate = {
  policyId: string;
  policyName: string;
  channel: 'whatsapp' | 'sms' | 'email' | 'in_app';
  offsetDays: number;
  anchor: ReminderAnchor;
  templateKey: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  bookingId: string;
  rentInvoiceId: string;
  pgId: string;
  pgName: string;
  billingDate: string;
  dueDate: string;
  amountPaise: number;
  scheduledForDate: string;
};

export type ReminderDeliveryResult = {
  deliveryId: string;
  status: 'pending' | 'sent_link' | 'skipped' | 'failed';
  waMeUrl?: string | null;
  error?: string | null;
};

/**
 * List open rent invoices whose billing/due dates match enabled policies for asOf.
 * Pure matching is tested separately; this loads rows from admin projections.
 */
export async function listDueReminders(opts?: {
  asOf?: DateLike;
  pgId?: string;
}): Promise<DueReminderCandidate[]> {
  const asOf = asOfIso(opts?.asOf);
  const policies = await db
    .select()
    .from(collectionReminderPolicies)
    .where(eq(collectionReminderPolicies.enabled, true));

  if (policies.length === 0) return [];

  const openResult = await listAdminOpenRentInvoices(
    opts?.pgId ? { pgId: opts.pgId } : undefined,
  );
  if (!openResult.ok) return [];

  const candidates: DueReminderCandidate[] = [];

  for (const row of openResult.data) {
    if (row.outstandingPaise <= 0) continue;
    if (!row.dueDate) continue;
    if (opts?.pgId && row.pgId !== opts.pgId) continue;

    for (const policy of policies) {
      if (policy.pgId && policy.pgId !== row.pgId) continue;

      const match = reminderMatchesAsOf({
        offsetDays: policy.offsetDays,
        anchor: policy.anchor,
        billingDate: row.billingMonth,
        dueDate: row.dueDate,
        asOf,
      });
      if (!match) continue;

      candidates.push({
        policyId: policy.id,
        policyName: policy.name,
        channel: policy.channel,
        offsetDays: policy.offsetDays,
        anchor: policy.anchor,
        templateKey: policy.templateKey,
        customerId: row.customerId,
        customerName: row.customerFullName,
        customerPhone: row.customerPhone,
        bookingId: row.bookingId,
        rentInvoiceId: row.id,
        pgId: row.pgId,
        pgName: row.pgName,
        billingDate: row.billingMonth,
        dueDate: row.dueDate,
        amountPaise: row.outstandingPaise,
        scheduledForDate: asOf,
      });
    }
  }

  return candidates;
}

async function loadTemplate(
  key: string,
  channel: DueReminderCandidate['channel'],
): Promise<{ bodyText: string } | null> {
  const [row] = await db
    .select({
      bodyText: collectionReminderTemplates.bodyText,
    })
    .from(collectionReminderTemplates)
    .where(
      and(
        eq(collectionReminderTemplates.key, key),
        eq(collectionReminderTemplates.channel, channel),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Create a delivery log row and, for WhatsApp, attach a wa.me link.
 * Status is honest: sent_link means "link generated for operator", not Meta-sent.
 */
export async function createReminderDelivery(
  candidate: DueReminderCandidate,
  opts?: { publicPayUrl?: string | null },
): Promise<ReminderDeliveryResult> {
  if (candidate.channel !== 'whatsapp') {
    const [inserted] = await db
      .insert(collectionReminderDeliveries)
      .values({
        policyId: candidate.policyId,
        customerId: candidate.customerId,
        bookingId: candidate.bookingId,
        rentInvoiceId: candidate.rentInvoiceId,
        channel: candidate.channel,
        status: 'skipped',
        error: `Channel ${candidate.channel} not implemented in Phase 1`,
        scheduledForDate: candidate.scheduledForDate,
      })
      .returning({ id: collectionReminderDeliveries.id });

    return {
      deliveryId: inserted?.id ?? 'duplicate',
      status: 'skipped',
      error: `Channel ${candidate.channel} not implemented in Phase 1`,
    };
  }

  const template = await loadTemplate(candidate.templateKey, 'whatsapp');
  if (!template) {
    const [inserted] = await db
      .insert(collectionReminderDeliveries)
      .values({
        policyId: candidate.policyId,
        customerId: candidate.customerId,
        bookingId: candidate.bookingId,
        rentInvoiceId: candidate.rentInvoiceId,
        channel: 'whatsapp',
        status: 'failed',
        error: `Missing template ${candidate.templateKey}`,
        scheduledForDate: candidate.scheduledForDate,
      })
      .returning({ id: collectionReminderDeliveries.id });

    return {
      deliveryId: inserted?.id ?? '',
      status: 'failed',
      error: `Missing template ${candidate.templateKey}`,
    };
  }

  const amountInr = (candidate.amountPaise / 100).toLocaleString('en-IN');
  const body = renderReminderTemplate(template.bodyText, {
    name: candidate.customerName.split(/\s+/)[0] || candidate.customerName,
    pg: candidate.pgName,
    month: candidate.billingDate.slice(0, 7),
    due_date: candidate.dueDate,
    amount: `Rs. ${amountInr}`,
    link: opts?.publicPayUrl ?? '',
  });

  const waMeUrl = buildWaMeUrl(candidate.customerPhone, body);
  if (!waMeUrl) {
    const [inserted] = await db
      .insert(collectionReminderDeliveries)
      .values({
        policyId: candidate.policyId,
        customerId: candidate.customerId,
        bookingId: candidate.bookingId,
        rentInvoiceId: candidate.rentInvoiceId,
        channel: 'whatsapp',
        status: 'skipped',
        error: 'Invalid or missing phone for wa.me',
        scheduledForDate: candidate.scheduledForDate,
      })
      .returning({ id: collectionReminderDeliveries.id });

    return {
      deliveryId: inserted?.id ?? '',
      status: 'skipped',
      error: 'Invalid or missing phone for wa.me',
    };
  }

  try {
    const [inserted] = await db
      .insert(collectionReminderDeliveries)
      .values({
        policyId: candidate.policyId,
        customerId: candidate.customerId,
        bookingId: candidate.bookingId,
        rentInvoiceId: candidate.rentInvoiceId,
        channel: 'whatsapp',
        status: 'sent_link',
        providerRef: waMeUrl,
        scheduledForDate: candidate.scheduledForDate,
        sentAt: new Date(),
      })
      .returning({ id: collectionReminderDeliveries.id });

    return {
      deliveryId: inserted?.id ?? '',
      status: 'sent_link',
      waMeUrl,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Unique violation → already delivered for this schedule
    if (/unique|duplicate/i.test(message)) {
      return { deliveryId: 'duplicate', status: 'skipped', error: 'Already delivered' };
    }
    return { deliveryId: '', status: 'failed', error: message };
  }
}

/** Cron entrypoint: list due reminders and write delivery logs. */
export async function runCollectionsRemindersJob(opts?: {
  asOf?: DateLike;
  pgId?: string;
}): Promise<{
  asOf: string;
  candidates: number;
  sentLink: number;
  skipped: number;
  failed: number;
}> {
  const asOf = asOfIso(opts?.asOf);
  const candidates = await listDueReminders({ asOf, pgId: opts?.pgId });

  let sentLink = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of candidates) {
    const result = await createReminderDelivery(c);
    if (result.status === 'sent_link') sentLink += 1;
    else if (result.status === 'failed') failed += 1;
    else skipped += 1;
  }

  return {
    asOf,
    candidates: candidates.length,
    sentLink,
    skipped,
    failed,
  };
}

export async function listReminderPoliciesForAdmin(pgId?: string) {
  const rows = await db.select().from(collectionReminderPolicies);
  if (!pgId) return rows;
  return rows.filter((r) => r.pgId == null || r.pgId === pgId);
}
