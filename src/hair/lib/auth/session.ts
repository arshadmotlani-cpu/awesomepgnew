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

export type HairAdmin = typeof fyhAdminUsers.$inferSelect;

export type HairSession = {
  sessionId: string;
  admin: HairAdmin;
};

export async function createHairSession(
  adminId: string,
  rememberMe = false,
): Promise<{ token: string; maxAgeDays: number }> {
  const token = randomToken(32);
  const tokenHash = sha256(token);
  const maxAgeDays = rememberMe ? HAIR_SESSION_TTL_DAYS_REMEMBER : HAIR_SESSION_TTL_DAYS;
  const expiresAt = new Date(Date.now() + maxAgeDays * 24 * 60 * 60 * 1000);

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

export async function getHairSession(): Promise<HairSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(HAIR_SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = sha256(token);
  const now = new Date();

  const [row] = await hairDb
    .select({
      sessionId: fyhAuthSessions.id,
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

  return row ?? null;
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

export function hairSessionCookieOptions(secure: boolean, maxAgeDays: number) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeDays * 24 * 60 * 60,
  };
}
