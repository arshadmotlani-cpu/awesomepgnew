import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhAppointments,
  fyhCustomerMemberships,
  fyhCustomers,
  fyhNotificationOutbox,
  fyhNotificationTemplates,
  type FyhNotificationKind,
} from '@/src/hair/db/schema';
import type { FyhCommunicationSettings } from '@/src/hair/db/schema/settings';
import { salonDayBounds, salonDayKeyOffset } from '@/src/hair/lib/salonTime';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { invoicePublicViewUrl } from '@/src/hair/lib/invoicePublicLinks';
import { getSalonSettings } from '@/src/hair/services/settings';
import { enqueueNotification } from '@/src/hair/services/loyaltyOps';
import { listLowStockProducts } from '@/src/hair/services/stock';
import { receivablesReport } from '@/src/hair/services/reportQueries';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';

/** Template kinds including salon-configured invoice body (not always in fyh_notification_templates). */
export type NotificationTemplateKind = FyhNotificationKind | 'whatsapp_invoice';

export const DEFAULT_TEMPLATE_BODIES: Record<FyhNotificationKind, string> = {
  appointment_reminder: 'Hi {{name}}, reminder for your appointment tomorrow at {{time}}.',
  appointment_confirmation: 'Hi {{name}}, your appointment is confirmed for {{time}}.',
  birthday: 'Happy Birthday {{name}}! Enjoy a special treat at For Your Hair.',
  anniversary: 'Happy Anniversary {{name}}! Visit us for a celebration offer.',
  membership_expiry: 'Hi {{name}}, your membership expires on {{date}}.',
  package_expiry: 'Hi {{name}}, your package sessions expire on {{date}}.',
  outstanding_payment: 'Hi {{name}}, you have an outstanding balance of {{amount}}.',
  review_request: 'Hi {{name}}, how was your visit? We would love your feedback.',
  follow_up: 'Hi {{name}}, checking in after your service. Book your next visit anytime.',
  low_stock: 'Low stock alert: {{product}} is below reorder level.',
  invoice_ready: 'Hi {{name}}, your invoice for {{amount}} is ready: {{link}}',
};

const DEFAULT_WHATSAPP_INVOICE_BODY = DEFAULT_TEMPLATE_BODIES.invoice_ready;

const SETTINGS_OVERRIDE_BY_KIND: Partial<
  Record<NotificationTemplateKind, keyof FyhCommunicationSettings>
> = {
  whatsapp_invoice: 'whatsappInvoiceTemplate',
  invoice_ready: 'whatsappInvoiceTemplate',
  review_request: 'reviewRequestTemplate',
};

export function interpolateTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

function resolveTemplateKind(kind: NotificationTemplateKind): FyhNotificationKind | null {
  if (kind === 'whatsapp_invoice') return 'invoice_ready';
  return kind;
}

async function getDbTemplateBody(kind: FyhNotificationKind, ctx?: TenantContext | null): Promise<string | null> {
  ctx = await resolveTenantContextForService(ctx);
  const [row] = await hairDb
    .select({ body: fyhNotificationTemplates.body, isActive: fyhNotificationTemplates.isActive })
    .from(fyhNotificationTemplates)
    .where(and(orgFilter(fyhNotificationTemplates.organizationId, ctx), eq(fyhNotificationTemplates.kind, kind)))
    .limit(1);
  if (!row?.isActive) return null;
  return row.body;
}

/** Settings override → DB template → default seed. */
export async function renderTemplate(
  kind: NotificationTemplateKind,
  vars: Record<string, string>,
  settings?: FyhCommunicationSettings | null, ctx?: TenantContext | null): Promise<string> {
  ctx = await resolveTenantContextForService(ctx);
  const overrideKey = SETTINGS_OVERRIDE_BY_KIND[kind];
  const overrideBody = overrideKey ? settings?.[overrideKey]?.trim() : undefined;
  if (overrideBody) return interpolateTemplate(overrideBody, vars);

  const dbKind = resolveTemplateKind(kind);
  if (dbKind) {
    const dbBody = await getDbTemplateBody(dbKind, ctx);
    if (dbBody) return interpolateTemplate(dbBody, vars);
  }

  if (kind === 'whatsapp_invoice') {
    return interpolateTemplate(DEFAULT_WHATSAPP_INVOICE_BODY, vars);
  }
  return interpolateTemplate(DEFAULT_TEMPLATE_BODIES[kind], vars);
}

export function buildWhatsAppUrl(recipient: string, body: string): string {
  const digits = recipient.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
}

export function normalizeRecipientPhone(
  phone: string | null | undefined,
  whatsapp?: string | null,
): string | null {
  const raw = whatsapp?.trim() || phone?.trim() || null;
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
}

export function formatSalonDateTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export async function dispatchNotification(input: {
  kind: FyhNotificationKind;
  customerId?: string | null;
  recipient: string;
  context?: Record<string, string>;
  subject?: string;
}, ctx?: TenantContext | null): Promise<{ outboxId: string; body: string; waUrl: string } | null> {
  ctx = await resolveTenantContextForService(ctx);
  const settings = await getSalonSettings(ctx);
  if (!settings.whatsappSettings.enabled) return null;

  const recipient = normalizeRecipientPhone(input.recipient);
  if (!recipient) return null;

  const body = await renderTemplate(input.kind, input.context ?? {}, settings.communicationSettings, ctx);
  const row = await enqueueNotification({
    kind: input.kind,
    recipient,
    body,
    subject: input.subject,
  }, ctx);
  return { outboxId: row.id, body, waUrl: buildWhatsAppUrl(recipient, body) };
}

export async function enqueuePostCheckoutNotifications(input: {
  customerId: string;
  customerName: string;
  phone: string | null;
  whatsapp?: string | null;
  invoiceNumber: string;
  grandTotalPaise: number;
  baseUrl?: string;
}, ctx?: TenantContext | null): Promise<void> {
  ctx = await resolveTenantContextForService(ctx);
  const settings = await getSalonSettings(ctx);
  if (!settings.whatsappSettings.enabled) return;

  const recipient = normalizeRecipientPhone(input.phone, input.whatsapp);
  if (!recipient) return;

  const link = invoicePublicViewUrl(input.invoiceNumber);
  const vars = {
    name: input.customerName,
    amount: formatInrFromPaise(input.grandTotalPaise),
    link,
  };

  const invoiceBody = await renderTemplate('whatsapp_invoice', vars, settings.communicationSettings, ctx);
  await enqueueNotification({
    kind: 'invoice_ready',
    recipient,
    body: invoiceBody,
    subject: 'Invoice ready',
  }, ctx);

  if (settings.googleReviewUrl?.trim()) {
    const reviewVars = {
      name: input.customerName,
      link: settings.googleReviewUrl.trim(),
    };
    const reviewBody = await renderTemplate(
      'review_request',
      reviewVars,
      settings.communicationSettings,
      ctx,
    );
    await enqueueNotification({
      kind: 'review_request',
      recipient,
      body: reviewBody,
      subject: 'Review request',
    }, ctx);
  }
}

async function wasRecentlyQueued(
  kind: FyhNotificationKind,
  recipient: string,
  since: Date,
  ctx?: TenantContext | null,
): Promise<boolean> {
  ctx = await resolveTenantContextForService(ctx);
  const [row] = await hairDb
    .select({ id: fyhNotificationOutbox.id })
    .from(fyhNotificationOutbox)
    .where(
      and(
        orgFilter(fyhNotificationOutbox.organizationId, ctx),
        eq(fyhNotificationOutbox.kind, kind),
        eq(fyhNotificationOutbox.recipient, recipient),
        gte(fyhNotificationOutbox.createdAt, since),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Stub processor: marks pending rows sent when WhatsApp is enabled and recipient is valid. */
export async function processOutboxBatch(limit = 20, ctx?: TenantContext | null): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  ctx = await resolveTenantContextForService(ctx);
  const settings = await getSalonSettings(ctx);
  const rows = await hairDb
    .select()
    .from(fyhNotificationOutbox)
    .where(and(orgFilter(fyhNotificationOutbox.organizationId, ctx), eq(fyhNotificationOutbox.status, 'pending')))
    .orderBy(fyhNotificationOutbox.scheduledFor)
    .limit(limit);

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const digits = row.recipient.replace(/\D/g, '');
    const canSend = settings.whatsappSettings.enabled && digits.length >= 10;
    if (canSend) {
      await hairDb
        .update(fyhNotificationOutbox)
        .set({ status: 'sent', sentAt: new Date(), error: null })
        .where(and(orgFilter(fyhNotificationOutbox.organizationId, ctx), eq(fyhNotificationOutbox.id, row.id)));
      sent += 1;
    } else {
      await hairDb
        .update(fyhNotificationOutbox)
        .set({
          status: 'failed',
          error: settings.whatsappSettings.enabled
            ? 'Invalid recipient phone'
            : 'WhatsApp disabled in settings',
        })
        .where(and(orgFilter(fyhNotificationOutbox.organizationId, ctx), eq(fyhNotificationOutbox.id, row.id)));
      failed += 1;
    }
  }

  return { processed: rows.length, sent, failed };
}

export async function sendAppointmentReminders(ctx?: TenantContext | null): Promise<number> {
  ctx = await resolveTenantContextForService(ctx);
  const settings = await getSalonSettings(ctx);
  if (!settings.whatsappSettings.enabled) return 0;

  const timezone = settings.timezone || 'Asia/Kolkata';
  const { dayKey } = salonDayBounds(timezone);
  const tomorrowKey = salonDayKeyOffset(dayKey, 1);
  const tomorrowStart = new Date(`${tomorrowKey}T00:00:00.000Z`);
  const tomorrowEnd = new Date(`${tomorrowKey}T23:59:59.999Z`);
  const dedupeSince = new Date(Date.now() - 20 * 60 * 60 * 1000);

  const rows = await hairDb
    .select({
      startAt: fyhAppointments.startAt,
      fullName: fyhCustomers.fullName,
      phone: fyhCustomers.phone,
      whatsapp: fyhCustomers.whatsapp,
    })
    .from(fyhAppointments)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhAppointments.customerId))
    .where(
      and(
        orgFilter(fyhAppointments.organizationId, ctx),
        locationFilter(fyhAppointments.locationId, ctx),
        gte(fyhAppointments.startAt, tomorrowStart),
        lte(fyhAppointments.startAt, tomorrowEnd),
        sql`${fyhAppointments.status} not in ('cancelled', 'no_show')`,
      ),
    );

  let count = 0;
  for (const row of rows) {
    const recipient = normalizeRecipientPhone(row.phone, row.whatsapp);
    if (!recipient) continue;
    if (await wasRecentlyQueued('appointment_reminder', recipient, dedupeSince, ctx)) continue;

    const time = formatSalonDateTime(row.startAt, timezone);
    await dispatchNotification({
      kind: 'appointment_reminder',
      recipient,
      context: { name: row.fullName, time },
      subject: 'Appointment reminder',
    }, ctx);
    count += 1;
  }
  return count;
}

export async function sendBirthdayMessages(ctx?: TenantContext | null): Promise<number> {
  ctx = await resolveTenantContextForService(ctx);
  const settings = await getSalonSettings(ctx);
  if (!settings.whatsappSettings.enabled) return 0;

  const timezone = settings.timezone || 'Asia/Kolkata';
  const { dayKey } = salonDayBounds(timezone);
  const [, month, day] = dayKey.split('-');
  const monthDay = `${month}-${day}`;
  const dedupeSince = new Date(Date.now() - 20 * 60 * 60 * 1000);

  const customers = await hairDb
    .select({
      id: fyhCustomers.id,
      fullName: fyhCustomers.fullName,
      phone: fyhCustomers.phone,
      whatsapp: fyhCustomers.whatsapp,
      dateOfBirth: fyhCustomers.dateOfBirth,
    })
    .from(fyhCustomers)
    .where(and(orgFilter(fyhCustomers.organizationId, ctx), eq(fyhCustomers.isActive, true), sql`${fyhCustomers.dateOfBirth} is not null`));

  let count = 0;
  for (const c of customers) {
    if (!c.dateOfBirth) continue;
    const dobMonthDay = c.dateOfBirth.slice(5);
    if (dobMonthDay !== monthDay) continue;

    const recipient = normalizeRecipientPhone(c.phone, c.whatsapp);
    if (!recipient) continue;
    if (await wasRecentlyQueued('birthday', recipient, dedupeSince, ctx)) continue;

    await dispatchNotification({
      kind: 'birthday',
      customerId: c.id,
      recipient,
      context: { name: c.fullName },
      subject: 'Birthday greeting',
    }, ctx);
    count += 1;
  }
  return count;
}

export async function sendMembershipExpiryWarnings(daysAhead = 7, ctx?: TenantContext | null): Promise<number> {
  ctx = await resolveTenantContextForService(ctx);
  const settings = await getSalonSettings(ctx);
  if (!settings.whatsappSettings.enabled) return 0;

  const timezone = settings.timezone || 'Asia/Kolkata';
  const { dayKey } = salonDayBounds(timezone);
  const targetKey = salonDayKeyOffset(dayKey, daysAhead);
  const dedupeSince = new Date(Date.now() - 20 * 60 * 60 * 1000);

  const rows = await hairDb
    .select({
      expiresOn: fyhCustomerMemberships.expiresOn,
      fullName: fyhCustomers.fullName,
      phone: fyhCustomers.phone,
      whatsapp: fyhCustomers.whatsapp,
    })
    .from(fyhCustomerMemberships)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhCustomerMemberships.customerId))
    .where(
      and(
        orgFilter(fyhCustomerMemberships.organizationId, ctx),
        eq(fyhCustomerMemberships.isActive, true),
        eq(fyhCustomerMemberships.expiresOn, targetKey),
      ),
    );

  let count = 0;
  for (const row of rows) {
    const recipient = normalizeRecipientPhone(row.phone, row.whatsapp);
    if (!recipient) continue;
    if (await wasRecentlyQueued('membership_expiry', recipient, dedupeSince, ctx)) continue;

    await dispatchNotification({
      kind: 'membership_expiry',
      recipient,
      context: { name: row.fullName, date: row.expiresOn },
      subject: 'Membership expiry',
    }, ctx);
    count += 1;
  }
  return count;
}

export async function sendOutstandingPaymentReminders(ctx?: TenantContext | null): Promise<number> {
  ctx = await resolveTenantContextForService(ctx);
  const settings = await getSalonSettings(ctx);
  if (!settings.whatsappSettings.enabled) return 0;

  const dedupeSince = new Date(Date.now() - 20 * 60 * 60 * 1000);
  const rows = await receivablesReport(undefined, ctx);
  let count = 0;

  for (const row of rows) {
    if (row.balancePaise <= 0) continue;
    const recipient = normalizeRecipientPhone(row.phone);
    if (!recipient) continue;
    if (await wasRecentlyQueued('outstanding_payment', recipient, dedupeSince, ctx)) continue;

    await dispatchNotification({
      kind: 'outstanding_payment',
      customerId: row.customerId,
      recipient,
      context: {
        name: row.customerName,
        amount: formatInrFromPaise(row.balancePaise),
      },
      subject: 'Outstanding payment',
    }, ctx);
    count += 1;
  }
  return count;
}

export async function sendLowStockAlerts(ctx?: TenantContext | null): Promise<number> {
  ctx = await resolveTenantContextForService(ctx);
  const settings = await getSalonSettings(ctx);
  if (!settings.whatsappSettings.enabled) return 0;

  const businessPhone = settings.whatsappSettings.businessPhone?.trim();
  const recipient = businessPhone ? normalizeRecipientPhone(businessPhone) : null;
  if (!recipient) return 0;

  const products = await listLowStockProducts(ctx);
  if (products.length === 0) return 0;

  const dedupeSince = new Date(Date.now() - 20 * 60 * 60 * 1000);
  if (await wasRecentlyQueued('low_stock', recipient, dedupeSince, ctx)) return 0;

  const productList = products.map((p) => `${p.name} (${p.stockQty})`).join(', ');
  await dispatchNotification({
    kind: 'low_stock',
    recipient,
    context: { product: productList },
    subject: 'Low stock alert',
  }, ctx);
  return 1;
}

export async function buildNotificationPreview(input: {
  kind: 'whatsapp_invoice' | 'review_request';
  customerName: string;
  customerPhone: string;
  grandTotalPaise?: number;
  invoiceNumber?: string;
  baseUrl?: string;
}, ctx?: TenantContext | null): Promise<{ body: string; waUrl: string } | null> {
  ctx = await resolveTenantContextForService(ctx);
  const settings = await getSalonSettings(ctx);
  const recipient = normalizeRecipientPhone(input.customerPhone);
  if (!recipient) return null;

  const link =
    input.kind === 'review_request'
      ? settings.googleReviewUrl?.trim() ?? ''
      : input.invoiceNumber
        ? invoicePublicViewUrl(input.invoiceNumber)
        : '';

  const vars: Record<string, string> =
    input.kind === 'whatsapp_invoice'
      ? {
          name: input.customerName,
          amount: formatInrFromPaise(input.grandTotalPaise ?? 0),
          link,
        }
      : {
          name: input.customerName,
          link,
        };

  const body = await renderTemplate(input.kind, vars, settings.communicationSettings, ctx);
  return { body, waUrl: buildWhatsAppUrl(recipient, body) };
}
