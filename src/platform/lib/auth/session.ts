import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { createPlatformClient } from '@/src/platform/db/client';
import { platformMembershipsSuper, platformUsers } from '@/src/platform/db/schema';
import { hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';
import { PLATFORM_SESSION_COOKIE } from './constants';
import { platformSessionCookieOptions, platformSessionExpiry } from './sessionPolicy';

export type PlatformUser = typeof platformUsers.$inferSelect;

export type PlatformSession = {
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
  expiresAt: Date;
};

function sessionSecret(): string {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.PLATFORM_SESSION_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    'dev-platform-session-secret-change-me'
  );
}

function signPayload(payload: string): string {
  const sig = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySigned(value: string): string | null {
  const idx = value.lastIndexOf('.');
  if (idx <= 0) return null;
  const payload = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  const expected = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return payload;
}

export async function createPlatformSession(
  userId: string,
  rememberMe = false,
): Promise<{ token: string; maxAgeSeconds: number }> {
  const expiresAt = platformSessionExpiry(rememberMe);
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: expiresAt.getTime(), v: 1 }),
    'utf8',
  ).toString('base64url');
  const token = signPayload(payload);
  const maxAgeSeconds = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return { token, maxAgeSeconds };
}

export async function getPlatformSession(): Promise<PlatformSession | null> {
  if (!hasPlatformDatabaseUrl()) return null;
  const cookieStore = await cookies();
  const raw = cookieStore.get(PLATFORM_SESSION_COOKIE)?.value;
  if (!raw) return null;

  const payload = verifySigned(raw);
  if (!payload) return null;

  let parsed: { userId?: string; exp?: number };
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      userId?: string;
      exp?: number;
    };
  } catch {
    return null;
  }

  if (!parsed.userId || !parsed.exp || parsed.exp < Date.now()) return null;

  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [user] = await db
      .select()
      .from(platformUsers)
      .where(eq(platformUsers.id, parsed.userId))
      .limit(1);
    if (!user || user.status !== 'active') return null;

    const superRows = await db
      .select({ id: platformMembershipsSuper.id })
      .from(platformMembershipsSuper)
      .where(eq(platformMembershipsSuper.userId, user.id))
      .limit(1);

    return {
      userId: user.id,
      email: user.email,
      isPlatformAdmin: superRows.length > 0,
      expiresAt: new Date(parsed.exp),
    };
  } finally {
    await close();
  }
}

export async function revokePlatformSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(PLATFORM_SESSION_COOKIE);
}

export async function writePlatformSessionCookie(
  token: string,
  maxAgeSeconds: number,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    PLATFORM_SESSION_COOKIE,
    token,
    platformSessionCookieOptions(process.env.NODE_ENV === 'production', maxAgeSeconds),
  );
}
