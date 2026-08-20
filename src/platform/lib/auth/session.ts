import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { createPlatformClient } from '@/src/platform/db/client';
import { platformMembershipsSuper, platformUsers } from '@/src/platform/db/schema';
import { hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';
import { PLATFORM_SESSION_COOKIE } from './constants';
import {
  readPlatformSessionCookiePayload,
  signPlatformSessionPayload,
} from './sessionCookie';
import { platformSessionCookieOptions, platformSessionExpiry } from './sessionPolicy';

export type PlatformUser = typeof platformUsers.$inferSelect;

export type PlatformSession = {
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
  expiresAt: Date;
};

export async function createPlatformSession(
  userId: string,
  rememberMe = false,
): Promise<{ token: string; maxAgeSeconds: number }> {
  const expiresAt = platformSessionExpiry(rememberMe);
  const token = signPlatformSessionPayload(userId, expiresAt);
  const maxAgeSeconds = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return { token, maxAgeSeconds };
}

export async function getPlatformSession(): Promise<PlatformSession | null> {
  if (!hasPlatformDatabaseUrl()) return null;
  const cookieStore = await cookies();
  const raw = cookieStore.get(PLATFORM_SESSION_COOKIE)?.value;
  const parsed = readPlatformSessionCookiePayload(raw);
  if (!parsed) return null;

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
