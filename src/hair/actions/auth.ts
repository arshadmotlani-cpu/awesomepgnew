'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhAdminUsers } from '@/src/hair/db/schema';
import { HAIR_SESSION_COOKIE } from '@/src/hair/lib/auth/constants';
import { verifyPassword } from '@/src/hair/lib/auth/crypto';
import { requireHairHost, resolveDefaultLandingPath, safeHairNextPath } from '@/src/hair/lib/auth/guards';
import { checkLoginRateLimit, resetLoginRateLimit } from '@/src/hair/lib/auth/loginRateLimit';
import {
  createHairSession,
  hairSessionCookieOptions,
  revokeHairSession,
} from '@/src/hair/lib/auth/session';

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  await requireHairHost();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '');
  const rememberMe = String(formData.get('rememberMe') ?? '') === 'on';

  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rateLimit = checkLoginRateLimit(ip);
  if (!rateLimit.allowed) {
    return { error: 'Too many attempts. Try again later.' };
  }

  const [admin] = await hairDb
    .select()
    .from(fyhAdminUsers)
    .where(eq(fyhAdminUsers.email, email))
    .limit(1);

  if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
    return { error: 'Invalid credentials' };
  }

  resetLoginRateLimit(ip);
  const { token, maxAgeDays } = await createHairSession(admin.id, rememberMe);
  const cookieStore = await cookies();
  cookieStore.set(
    HAIR_SESSION_COOKIE,
    token,
    hairSessionCookieOptions(
      process.env.NODE_ENV === 'production',
      maxAgeDays * 24 * 60 * 60,
    ),
  );

  await hairDb
    .update(fyhAdminUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(fyhAdminUsers.id, admin.id));

  redirect(safeHairNextPath(next || resolveDefaultLandingPath(admin), admin));
}

export async function logoutAction(): Promise<void> {
  await revokeHairSession();
  const cookieStore = await cookies();
  cookieStore.delete(HAIR_SESSION_COOKIE);
  redirect('/login');
}
