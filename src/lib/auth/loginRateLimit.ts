import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { emailOtpAttemptLog } from '@/src/db/schema';

const LOGIN_FAILED_ACTION = 'login_failed';

function maxAttemptsPerHour(): number {
  const raw = process.env.AUTH_LOGIN_MAX_ATTEMPTS_PER_HOUR;
  if (!raw) return 20;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export async function countRecentLoginFailures(args: {
  email: string;
  ip: string | null;
  since: Date;
}): Promise<number> {
  const conditions = [
    eq(emailOtpAttemptLog.email, args.email),
    eq(emailOtpAttemptLog.action, LOGIN_FAILED_ACTION),
    eq(emailOtpAttemptLog.success, false),
    gte(emailOtpAttemptLog.createdAt, args.since),
  ];
  if (args.ip) {
    conditions.push(eq(emailOtpAttemptLog.ip, args.ip));
  }
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailOtpAttemptLog)
    .where(and(...conditions));
  return row?.count ?? 0;
}

export async function recordLoginAttempt(args: {
  email: string;
  success: boolean;
  reason?: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  await db.insert(emailOtpAttemptLog).values({
    email: args.email,
    action: args.success ? 'login_success' : LOGIN_FAILED_ACTION,
    success: args.success,
    reason: args.reason ?? null,
    ip: args.ip,
    userAgent: args.userAgent,
  });
}

export async function loginRateLimitStatus(args: {
  email: string;
  ip: string | null;
}): Promise<{ blocked: boolean; retryAfterSeconds?: number }> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const failures = await countRecentLoginFailures({ email: args.email, ip: args.ip, since });
  if (failures < maxAttemptsPerHour()) {
    return { blocked: false };
  }
  return { blocked: true, retryAfterSeconds: 3600 };
}
