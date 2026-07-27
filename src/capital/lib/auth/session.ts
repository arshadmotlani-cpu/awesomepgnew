import { cookies, headers } from 'next/headers';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import { acAdminUsers, acAuthSessions } from '@/src/capital/db/schema';
import { CAPITAL_SESSION_COOKIE, CAPITAL_SESSION_TTL_DAYS } from './constants';
import { randomToken, sha256 } from './crypto';
import {
  capitalSessionExpiry,
  shouldRefreshCapitalSession,
} from './sessionPolicy';

export type CapitalAdmin = typeof acAdminUsers.$inferSelect;

export type CapitalSession = {
  sessionId: string;
  admin: CapitalAdmin;
  expiresAt: Date;
};

export async function createCapitalSession(adminId: string): Promise<string> {
  const token = randomToken(32);
  const tokenHash = sha256(token);
  const expiresAt = capitalSessionExpiry();

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

async function refreshCapitalSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const cookieStore = await cookies();
  const maxAgeSeconds = Math.max(
    60,
    Math.floor((expiresAt.getTime() - Date.now()) / 1000),
  );
  cookieStore.set(
    CAPITAL_SESSION_COOKIE,
    token,
    capitalSessionCookieOptions(process.env.NODE_ENV === 'production', maxAgeSeconds),
  );
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
      expiresAt: acAuthSessions.expiresAt,
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

  if (!row) return null;

  let expiresAt = row.expiresAt;
  if (shouldRefreshCapitalSession(expiresAt, now)) {
    expiresAt = capitalSessionExpiry(now);
    await capitalDb
      .update(acAuthSessions)
      .set({ expiresAt })
      .where(eq(acAuthSessions.id, row.sessionId));
    await refreshCapitalSessionCookie(token, expiresAt);
  }

  return {
    sessionId: row.sessionId,
    admin: row.admin,
    expiresAt,
  };
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

export function capitalSessionCookieOptions(secure: boolean, maxAgeSeconds?: number) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds ?? CAPITAL_SESSION_TTL_DAYS * 24 * 60 * 60,
  };
}
