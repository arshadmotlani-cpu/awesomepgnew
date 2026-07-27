import { cookies, headers } from 'next/headers';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhAdminUsers, fyhAuthSessions } from '@/src/hair/db/schema';
import {
  HAIR_SESSION_COOKIE,
  HAIR_SESSION_TTL_DAYS,
  HAIR_SESSION_TTL_DAYS_REMEMBER,
} from './constants';
import { randomToken, sha256 } from './crypto';
import {
  hairSessionExpiry,
  hairSessionMs,
  shouldRefreshHairSession,
} from './sessionPolicy';

export type HairAdmin = typeof fyhAdminUsers.$inferSelect;

export type HairSession = {
  sessionId: string;
  admin: HairAdmin;
  expiresAt: Date;
  rememberMe: boolean;
};

export async function createHairSession(
  adminId: string,
  rememberMe = true,
): Promise<{ token: string; maxAgeDays: number }> {
  const token = randomToken(32);
  const tokenHash = sha256(token);
  const maxAgeDays = rememberMe ? HAIR_SESSION_TTL_DAYS_REMEMBER : HAIR_SESSION_TTL_DAYS;
  const expiresAt = hairSessionExpiry(rememberMe);

  const hdrs = await headers();
  await hairDb.insert(fyhAuthSessions).values({
    adminUserId: adminId,
    tokenHash,
    expiresAt,
    ipAddress: hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: hdrs.get('user-agent'),
  });

  return { token, maxAgeDays };
}

async function refreshHairSessionCookie(
  token: string,
  expiresAt: Date,
  secure: boolean,
): Promise<void> {
  const cookieStore = await cookies();
  const maxAgeSeconds = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  cookieStore.set(HAIR_SESSION_COOKIE, token, hairSessionCookieOptions(secure, maxAgeSeconds));
}

export async function getHairSession(): Promise<HairSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(HAIR_SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = sha256(token);
  const now = new Date();

  const [row] = await hairDb
    .select({
      sessionId: fyhAuthSessions.id,
      expiresAt: fyhAuthSessions.expiresAt,
      createdAt: fyhAuthSessions.createdAt,
      admin: fyhAdminUsers,
    })
    .from(fyhAuthSessions)
    .innerJoin(fyhAdminUsers, eq(fyhAuthSessions.adminUserId, fyhAdminUsers.id))
    .where(
      and(
        eq(fyhAuthSessions.tokenHash, tokenHash),
        gt(fyhAuthSessions.expiresAt, now),
        isNull(fyhAuthSessions.revokedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  const rememberMe =
    row.expiresAt.getTime() - row.createdAt.getTime() >
    HAIR_SESSION_TTL_DAYS * 86_400_000;

  let expiresAt = row.expiresAt;
  if (shouldRefreshHairSession(expiresAt, rememberMe, now)) {
    expiresAt = hairSessionExpiry(rememberMe, now);
    await hairDb
      .update(fyhAuthSessions)
      .set({ expiresAt })
      .where(eq(fyhAuthSessions.id, row.sessionId));
    await refreshHairSessionCookie(
      token,
      expiresAt,
      process.env.NODE_ENV === 'production',
    );
  }

  return {
    sessionId: row.sessionId,
    admin: row.admin,
    expiresAt,
    rememberMe,
  };
}

export async function revokeHairSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(HAIR_SESSION_COOKIE)?.value;
  if (!token) return;

  const tokenHash = sha256(token);
  await hairDb
    .update(fyhAuthSessions)
    .set({ revokedAt: new Date() })
    .where(eq(fyhAuthSessions.tokenHash, tokenHash));
}

export function hairSessionCookieOptions(secure: boolean, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
