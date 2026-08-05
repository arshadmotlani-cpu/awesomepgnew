'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { ownerDb } from '@/src/owner/db/client';
import { ooAdminUsers } from '@/src/owner/db/schema';
import { OWNER_SESSION_COOKIE } from '@/src/owner/lib/auth/constants';
import { verifyPassword } from '@/src/owner/lib/auth/crypto';
import { requireOwnerHost, safeOwnerNextPath } from '@/src/owner/lib/auth/guards';
import { checkLoginRateLimit, resetLoginRateLimit } from '@/src/owner/lib/auth/loginRateLimit';
import {
  createOwnerSession,
  ownerSessionCookieOptions,
  revokeOwnerSession,
} from '@/src/owner/lib/auth/session';

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  await requireOwnerHost();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/dashboard');

  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rateLimit = checkLoginRateLimit(ip);
  if (!rateLimit.allowed) {
    return { error: 'Too many attempts. Try again later.' };
  }

  const [admin] = await ownerDb
    .select()
    .from(ooAdminUsers)
    .where(eq(ooAdminUsers.email, email))
    .limit(1);

  if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
    return { error: 'Invalid credentials' };
  }

  resetLoginRateLimit(ip);
  const token = await createOwnerSession(admin.id);
  const cookieStore = await cookies();
  cookieStore.set(
    OWNER_SESSION_COOKIE,
    token,
    ownerSessionCookieOptions(process.env.NODE_ENV === 'production'),
  );

  await ownerDb
    .update(ooAdminUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(ooAdminUsers.id, admin.id));

  redirect(safeOwnerNextPath(next));
}

export async function logoutAction(): Promise<void> {
  await revokeOwnerSession();
  const cookieStore = await cookies();
  cookieStore.delete(OWNER_SESSION_COOKIE);
  redirect('/login');
}
