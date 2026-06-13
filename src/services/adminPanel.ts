import { and, desc, eq, or } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { adminUsers, auditLog, customers, pgs } from '@/src/db/schema';
import { paymentLinkPublicUrl } from '@/src/lib/billing/paymentLinkUrl';
import { listRecentPaymentLinks } from '@/src/services/paymentLinks';

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

export async function loadPaymentLinksPanel(limit = 50) {
  const rows = await listRecentPaymentLinks(limit);
  const enriched = await Promise.all(
    rows.map(async (link) => {
      const [resident] = await db
        .select({ fullName: customers.fullName })
        .from(customers)
        .where(eq(customers.id, link.residentId))
        .limit(1);
      const [pg] = await db
        .select({ name: pgs.name })
        .from(pgs)
        .where(eq(pgs.id, link.pgId))
        .limit(1);
      return {
        ...link,
        residentName: resident?.fullName ?? '—',
        pgName: pg?.name ?? '—',
        publicUrl: paymentLinkPublicUrl(link.id),
      };
    }),
  );
  return enriched;
}
