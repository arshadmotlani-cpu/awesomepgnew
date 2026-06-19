import { desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { emailDeliveryLog } from '@/src/db/schema';
import { classifyDatabaseError } from '@/src/lib/db/connectionOptions';
import { safeQuery } from '@/src/lib/healing/safeQuery';
import { traceQuery } from '@/src/lib/monitoring/traceQuery';

export type QueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; errorCode?: string };

export type CustomerEmailNotification = {
  id: string;
  subject: string;
  notificationKind: string;
  status: string;
  createdAt: Date;
};

async function guard<T>(fn: () => Promise<T>, queryName: string): Promise<QueryResult<T>> {
  const result = await safeQuery(queryName, () => traceQuery(queryName, fn), null as unknown as T);
  if (result.degraded) {
    const message = result.error ?? 'Database temporarily unavailable';
    const classified = classifyDatabaseError(message);
    return { ok: false, error: message, errorCode: classified.code };
  }
  return { ok: true, data: result.data };
}

export function listCustomerEmailNotifications(
  customerId: string,
  limit = 40,
): Promise<QueryResult<CustomerEmailNotification[]>> {
  return guard(async () => {
    return db
      .select({
        id: emailDeliveryLog.id,
        subject: emailDeliveryLog.subject,
        notificationKind: emailDeliveryLog.notificationKind,
        status: emailDeliveryLog.status,
        createdAt: emailDeliveryLog.createdAt,
      })
      .from(emailDeliveryLog)
      .where(eq(emailDeliveryLog.customerId, customerId))
      .orderBy(desc(emailDeliveryLog.createdAt))
      .limit(limit);
  }, 'listCustomerEmailNotifications');
}
