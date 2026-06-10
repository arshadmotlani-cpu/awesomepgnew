import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { emailOtpAttemptLog, emailOtpChallenges } from '@/src/db/schema';

export function resendAvailableAt(lastSentAt: Date, cooldownSeconds: number): Date {
  return new Date(lastSentAt.getTime() + cooldownSeconds * 1000);
}

export function secondsUntilResend(lastSentAt: Date, cooldownSeconds: number, now = new Date()): number {
  const available = resendAvailableAt(lastSentAt, cooldownSeconds);
  const diff = Math.ceil((available.getTime() - now.getTime()) / 1000);
  return Math.max(0, diff);
}

export async function countOtpSendsForEmail(email: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailOtpAttemptLog)
    .where(
      and(
        eq(emailOtpAttemptLog.email, email),
        eq(emailOtpAttemptLog.action, 'send'),
        eq(emailOtpAttemptLog.success, true),
        gte(emailOtpAttemptLog.createdAt, since),
      ),
    );
  return row?.count ?? 0;
}

export async function countOtpSendsForIp(ip: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailOtpAttemptLog)
    .where(
      and(
        eq(emailOtpAttemptLog.ip, ip),
        eq(emailOtpAttemptLog.action, 'send'),
        gte(emailOtpAttemptLog.createdAt, since),
      ),
    );
  return row?.count ?? 0;
}

export async function latestOtpSendForEmail(email: string): Promise<Date | null> {
  const [row] = await db
    .select({ createdAt: emailOtpChallenges.createdAt })
    .from(emailOtpChallenges)
    .where(eq(emailOtpChallenges.email, email))
    .orderBy(desc(emailOtpChallenges.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}
