'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import { acAdminUsers } from '@/src/capital/db/schema';
import { CAPITAL_SESSION_COOKIE } from '@/src/capital/lib/auth/constants';
import { verifyPassword } from '@/src/capital/lib/auth/crypto';
import { requireCapitalHost, safeCapitalNextPath } from '@/src/capital/lib/auth/guards';
import { checkLoginRateLimit, resetLoginRateLimit } from '@/src/capital/lib/auth/loginRateLimit';
import {
  capitalSessionCookieOptions,
  createCapitalSession,
  revokeCapitalSession,
} from '@/src/capital/lib/auth/session';
import { logActivity } from '@/src/capital/services/activity';

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  await requireCapitalHost();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/dashboard');

  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rateLimit = checkLoginRateLimit(ip);
  if (!rateLimit.allowed) {
    return { error: 'Too many attempts. Try again later.' };
  }

  const [admin] = await capitalDb
    .select()
    .from(acAdminUsers)
    .where(eq(acAdminUsers.email, email))
    .limit(1);

  if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
    await logActivity({
      action: 'login_failed',
      ipAddress: ip,
      userAgent: hdrs.get('user-agent'),
    });
    return { error: 'Invalid credentials' };
  }

  resetLoginRateLimit(ip);
  const token = await createCapitalSession(admin.id);
  const cookieStore = await cookies();
  cookieStore.set(
    CAPITAL_SESSION_COOKIE,
    token,
    capitalSessionCookieOptions(process.env.NODE_ENV === 'production'),
  );

  redirect(safeCapitalNextPath(next));
}

export async function logoutAction(): Promise<void> {
  await revokeCapitalSession();
  const cookieStore = await cookies();
  cookieStore.delete(CAPITAL_SESSION_COOKIE);
  redirect('/login');
}
