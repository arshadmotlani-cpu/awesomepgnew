import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { actionItems, kycSubmissions } from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import type { AdminModule } from '@/src/lib/admin/navigation';

export type AdminNavBadges = Partial<Record<AdminModule | 'deposits', number>>;

/**
 * Unresolved counts for sidebar badges — only open / in_progress action items
 * and pending KYC submissions scoped to the admin's PG access.
 */
export async function loadAdminNavBadges(session: AdminSession): Promise<AdminNavBadges> {
  const pgScope = session.pgScope;
  const isScoped = session.role !== 'super_admin' && pgScope.length > 0;

  const actionRows = await db
    .select({
      type: actionItems.type,
      pgId: actionItems.pgId,
      count: sql<number>`count(*)::int`,
    })
    .from(actionItems)
    .where(inArray(actionItems.status, ['open', 'in_progress']))
    .groupBy(actionItems.type, actionItems.pgId);

  const counts: Record<string, number> = {};
  for (const row of actionRows) {
    if (isScoped && !adminCanAccessPg({ role: session.role, pgScope }, row.pgId)) continue;
    counts[row.type] = (counts[row.type] ?? 0) + row.count;
  }

  const kycConditions = [eq(kycSubmissions.status, 'pending')];
  const kycRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(kycSubmissions)
    .where(and(...kycConditions));

  const kycPending = kycRows[0]?.count ?? 0;

  const collections =
    (counts.rent_due ?? 0) +
    (counts.electricity_due ?? 0) +
    (counts.payment_received ?? 0);

  const operations =
    (counts.vacating_alert ?? 0) +
    (counts.deposit_refund_request ?? 0) +
    (counts.extension_request ?? 0);

  const deposits =
    (counts.deposit_refund_request ?? 0) + (counts.refund_pending ?? 0);

  const overviewTotal = Object.values(counts).reduce((a, b) => a + b, 0) + kycPending;

  return {
    overview: overviewTotal,
    kyc: kycPending,
    collections,
    operations,
    deposits,
    residents: (counts.deposit_refund_request ?? 0) + (counts.extension_request ?? 0),
  };
}
