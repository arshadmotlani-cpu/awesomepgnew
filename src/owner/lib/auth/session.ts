import { cookies, headers } from 'next/headers';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { ownerDb } from '@/src/owner/db/client';
import { ooAdminUsers, ooAuthSessions } from '@/src/owner/db/schema';
import { OWNER_SESSION_COOKIE, OWNER_SESSION_TTL_DAYS } from './constants';
import { randomToken, sha256 } from './crypto';
import { ownerSessionExpiry, shouldRefreshOwnerSession } from './sessionPolicy';

export type OwnerAdmin = typeof ooAdminUsers.$inferSelect;

export type OwnerSession = {
  sessionId: string;
  admin: OwnerAdmin;
  expiresAt: Date;
};

export async function createOwnerSession(adminId: string): Promise<string> {
  const token = randomToken(32);
  const tokenHash = sha256(token);
  const expiresAt = ownerSessionExpiry();

  const hdrs = await headers();
  await ownerDb.insert(ooAuthSessions).values({
    adminUserId: adminId,
    tokenHash,
    expiresAt,
    ipAddress: hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: hdrs.get('user-agent'),
  });

  return token;
}

async function refreshOwnerSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const cookieStore = await cookies();
  const maxAgeSeconds = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  cookieStore.set(
    OWNER_SESSION_COOKIE,
    token,
    ownerSessionCookieOptions(process.env.NODE_ENV === 'production', maxAgeSeconds),
  );
}

export async function getOwnerSession(): Promise<OwnerSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(OWNER_SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = sha256(token);
  const now = new Date();

  const [row] = await ownerDb
    .select({
      sessionId: ooAuthSessions.id,
      expiresAt: ooAuthSessions.expiresAt,
      admin: ooAdminUsers,
    })
    .from(ooAuthSessions)
    .innerJoin(ooAdminUsers, eq(ooAuthSessions.adminUserId, ooAdminUsers.id))
    .where(
      and(
        eq(ooAuthSessions.tokenHash, tokenHash),
        gt(ooAuthSessions.expiresAt, now),
        isNull(ooAuthSessions.revokedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  let expiresAt = row.expiresAt;
  if (shouldRefreshOwnerSession(expiresAt, now)) {
    expiresAt = ownerSessionExpiry(now);
    await ownerDb
      .update(ooAuthSessions)
      .set({ expiresAt })
      .where(eq(ooAuthSessions.id, row.sessionId));
    await refreshOwnerSessionCookie(token, expiresAt);
  }

  return {
    sessionId: row.sessionId,
    admin: row.admin,
    expiresAt,
  };
}

export async function revokeOwnerSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(OWNER_SESSION_COOKIE)?.value;
  if (!token) return;

  const tokenHash = sha256(token);
  await ownerDb
    .update(ooAuthSessions)
    .set({ revokedAt: new Date() })
    .where(eq(ooAuthSessions.tokenHash, tokenHash));
}

export function ownerSessionCookieOptions(secure: boolean, maxAgeSeconds?: number) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds ?? OWNER_SESSION_TTL_DAYS * 24 * 60 * 60,
  };
}
