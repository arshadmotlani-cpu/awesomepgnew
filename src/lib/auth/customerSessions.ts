import { and, desc, eq, gt, ne } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { authSessions } from '@/src/db/schema';

export type CustomerSessionListItem = {
  id: string;
  deviceLabel: string;
  ip: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  rememberMe: boolean;
  isCurrent: boolean;
};

/** Human-readable device label from user-agent — never exposes PII. */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent?.trim()) return 'Unknown device';
  const ua = userAgent;
  let os = 'Unknown OS';
  if (/iPhone|iPad|iPod/i.test(ua)) os = 'iPhone / iPad';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'Mac';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  return `${os} · ${browser}`;
}

export async function listActiveCustomerSessions(
  customerId: string,
  currentSessionId: string | null,
): Promise<CustomerSessionListItem[]> {
  const rows = await db
    .select({
      id: authSessions.id,
      ip: authSessions.ip,
      userAgent: authSessions.userAgent,
      createdAt: authSessions.createdAt,
      lastSeenAt: authSessions.lastSeenAt,
      expiresAt: authSessions.expiresAt,
      rememberMe: authSessions.rememberMe,
    })
    .from(authSessions)
    .where(
      and(
        eq(authSessions.kind, 'customer'),
        eq(authSessions.subjectId, customerId),
        gt(authSessions.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(authSessions.lastSeenAt));

  return rows.map((row) => ({
    id: row.id,
    deviceLabel: describeUserAgent(row.userAgent),
    ip: row.ip,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
    rememberMe: row.rememberMe,
    isCurrent: currentSessionId != null && row.id === currentSessionId,
  }));
}

export async function revokeAllCustomerSessions(
  customerId: string,
  opts?: { exceptSessionId?: string | null },
): Promise<number> {
  const conditions = [
    eq(authSessions.kind, 'customer'),
    eq(authSessions.subjectId, customerId),
  ];
  if (opts?.exceptSessionId) {
    conditions.push(ne(authSessions.id, opts.exceptSessionId));
  }
  const deleted = await db
    .delete(authSessions)
    .where(and(...conditions))
    .returning({ id: authSessions.id });
  return deleted.length;
}
