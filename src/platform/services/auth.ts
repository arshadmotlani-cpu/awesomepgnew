import { eq } from 'drizzle-orm';
import { verifyPassword } from '@/src/lib/auth/crypto';
import { createPlatformClient } from '@/src/platform/db/client';
import { platformMembershipsSuper, platformUsers } from '@/src/platform/db/schema';
import { hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';

export type PlatformLoginResult =
  | { ok: true; userId: string; isPlatformAdmin: boolean }
  | { ok: false; error: string };

export async function authenticatePlatformUser(
  email: string,
  password: string,
): Promise<PlatformLoginResult> {
  if (!hasPlatformDatabaseUrl()) {
    return { ok: false, error: 'Platform database is not configured' };
  }

  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) {
    return { ok: false, error: 'Email and password are required' };
  }

  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [user] = await db
      .select()
      .from(platformUsers)
      .where(eq(platformUsers.email, normalized))
      .limit(1);

    if (!user || user.status !== 'active' || !user.passwordHash) {
      return { ok: false, error: 'Invalid credentials' };
    }
    if (!verifyPassword(password, user.passwordHash)) {
      return { ok: false, error: 'Invalid credentials' };
    }

    const [superRow] = await db
      .select({ id: platformMembershipsSuper.id })
      .from(platformMembershipsSuper)
      .where(eq(platformMembershipsSuper.userId, user.id))
      .limit(1);

    return {
      ok: true,
      userId: user.id,
      isPlatformAdmin: Boolean(superRow),
    };
  } finally {
    await close();
  }
}
