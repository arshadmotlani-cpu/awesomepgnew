import { and, desc, eq, gte, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { emailDeliveryLog } from '@/src/db/schema';

export type QueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function guard<T>(fn: () => Promise<T>): Promise<QueryResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type EmailDeliveryRow = {
  id: string;
  recipientEmail: string;
  recipientKind: string;
  subject: string;
  notificationKind: string;
  customerId: string | null;
  status: string;
  skipReason: string | null;
  provider: string | null;
  messageId: string | null;
  errorMessage: string | null;
  createdAt: Date;
};

export function listEmailDeliveryLog(
  opts?: { limit?: number; status?: string; q?: string },
): Promise<QueryResult<EmailDeliveryRow[]>> {
  return guard(async () => {
    const limit = opts?.limit ?? 100;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const conditions = [gte(emailDeliveryLog.createdAt, since)];

    if (opts?.status && opts.status !== 'all') {
      conditions.push(eq(emailDeliveryLog.status, opts.status));
    }
    if (opts?.q?.trim()) {
      const term = `%${opts.q.trim()}%`;
      conditions.push(
        or(
          ilike(emailDeliveryLog.recipientEmail, term),
          ilike(emailDeliveryLog.subject, term),
          ilike(emailDeliveryLog.notificationKind, term),
          ilike(emailDeliveryLog.skipReason, term),
          ilike(emailDeliveryLog.errorMessage, term),
        )!,
      );
    }

    return db
      .select({
        id: emailDeliveryLog.id,
        recipientEmail: emailDeliveryLog.recipientEmail,
        recipientKind: emailDeliveryLog.recipientKind,
        subject: emailDeliveryLog.subject,
        notificationKind: emailDeliveryLog.notificationKind,
        customerId: emailDeliveryLog.customerId,
        status: emailDeliveryLog.status,
        skipReason: emailDeliveryLog.skipReason,
        provider: emailDeliveryLog.provider,
        messageId: emailDeliveryLog.messageId,
        errorMessage: emailDeliveryLog.errorMessage,
        createdAt: emailDeliveryLog.createdAt,
      })
      .from(emailDeliveryLog)
      .where(and(...conditions))
      .orderBy(desc(emailDeliveryLog.createdAt))
      .limit(limit);
  });
}

export function emailDeliverySummary(): Promise<
  QueryResult<{ sent: number; failed: number; skipped: number }>
> {
  return guard(async () => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [row] = await db
      .select({
        sent: sql<number>`count(*) filter (where ${emailDeliveryLog.status} = 'sent')::int`,
        failed: sql<number>`count(*) filter (where ${emailDeliveryLog.status} = 'failed')::int`,
        skipped: sql<number>`count(*) filter (where ${emailDeliveryLog.status} = 'skipped')::int`,
      })
      .from(emailDeliveryLog)
      .where(gte(emailDeliveryLog.createdAt, since));
    return {
      sent: row?.sent ?? 0,
      failed: row?.failed ?? 0,
      skipped: row?.skipped ?? 0,
    };
  });
}
