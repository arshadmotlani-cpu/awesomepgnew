import { and, desc, eq, or } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { adminUsers, auditLog, customers, paymentLinks, pgs } from '@/src/db/schema';
import { paymentLinkPublicUrl } from '@/src/lib/billing/paymentLinkUrl';
import { expireStalePaymentLinks } from '@/src/services/paymentLinks';

export async function listRentChangeAuditLogs(limit = 100) {
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      actorId: auditLog.actorId,
      diff: auditLog.diff,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(
      or(
        and(eq(auditLog.entity, 'booking'), eq(auditLog.action, 'rent_updated')),
        and(eq(auditLog.entity, 'rent_invoice'), eq(auditLog.action, 'recalculate_pending')),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export async function listAdminUsersForPanel() {
  return db
    .select({
      id: adminUsers.id,
      fullName: adminUsers.fullName,
      email: adminUsers.email,
      role: adminUsers.role,
      isActive: adminUsers.isActive,
      createdAt: adminUsers.createdAt,
    })
    .from(adminUsers)
    .orderBy(adminUsers.fullName);
}

export async function listWhatsAppLogs(limit = 100) {
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityId: auditLog.entityId,
      diff: auditLog.diff,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(eq(auditLog.entity, 'whatsapp_message'))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export async function loadAdminPanelData() {
  void expireStalePaymentLinks(30).catch(() => 0);
  const [auditLogs, paymentLinks, admins, whatsappLogs] = await Promise.all([
    listRentChangeAuditLogs(),
    loadPaymentLinksPanel(),
    listAdminUsersForPanel(),
    listWhatsAppLogs(),
  ]);
  return { auditLogs, paymentLinks, admins, whatsappLogs };
}

export async function loadPaymentLinksPanel(limit = 50) {
  const rows = await db
    .select({
      link: paymentLinks,
      residentName: customers.fullName,
      pgName: pgs.name,
    })
    .from(paymentLinks)
    .leftJoin(customers, eq(customers.id, paymentLinks.residentId))
    .leftJoin(pgs, eq(pgs.id, paymentLinks.pgId))
    .orderBy(desc(paymentLinks.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row.link,
    residentName: row.residentName ?? '—',
    pgName: row.pgName ?? '—',
    publicUrl: paymentLinkPublicUrl(row.link.id),
  }));
}
