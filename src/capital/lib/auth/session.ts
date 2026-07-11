import { cookies, headers } from 'next/headers';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import { acAdminUsers, acAuthSessions } from '@/src/capital/db/schema';
import { CAPITAL_SESSION_COOKIE, CAPITAL_SESSION_TTL_DAYS } from './constants';
import { randomToken, sha256 } from './crypto';

export type CapitalAdmin = typeof acAdminUsers.$inferSelect;

export type CapitalSession = {
  sessionId: string;
  admin: CapitalAdmin;
};

export async function createCapitalSession(adminId: string): Promise<string> {
  const token = randomToken(32);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + CAPITAL_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const hdrs = await headers();
  await capitalDb.insert(acAuthSessions).values({
    adminUserId: adminId,
    tokenHash,
    expiresAt,
    ipAddress: hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: hdrs.get('user-agent'),
  });

  return token;
}

export async function getCapitalSession(): Promise<CapitalSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CAPITAL_SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = sha256(token);
  const now = new Date();

  const [row] = await capitalDb
    .select({
      sessionId: acAuthSessions.id,
      admin: acAdminUsers,
    })
    .from(acAuthSessions)
    .innerJoin(acAdminUsers, eq(acAuthSessions.adminUserId, acAdminUsers.id))
    .where(
      and(
        eq(acAuthSessions.tokenHash, tokenHash),
        gt(acAuthSessions.expiresAt, now),
        isNull(acAuthSessions.revokedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function revokeCapitalSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CAPITAL_SESSION_COOKIE)?.value;
  if (!token) return;

  const tokenHash = sha256(token);
  await capitalDb
    .update(acAuthSessions)
    .set({ revokedAt: new Date() })
    .where(eq(acAuthSessions.tokenHash, tokenHash));
}

export function capitalSessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: CAPITAL_SESSION_TTL_DAYS * 24 * 60 * 60,
  };
}
