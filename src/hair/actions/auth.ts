'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhAdminUsers } from '@/src/hair/db/schema';
import { HAIR_SESSION_COOKIE } from '@/src/hair/lib/auth/constants';
import { verifyPassword } from '@/src/hair/lib/auth/crypto';
import {
  requireHairHost,
  resolveDefaultLandingPath,
  safeHairNextPath,
} from '@/src/hair/lib/auth/guards';
import { checkLoginRateLimit, resetLoginRateLimit } from '@/src/hair/lib/auth/loginRateLimit';
import {
  createHairSession,
  hairSessionCookieOptions,
  revokeHairSession,
} from '@/src/hair/lib/auth/session';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';
import {
  findEmployeeByLegacyAdminId,
  findEmployeeByMobile,
  listMemberships,
  resolvePermissions,
} from '@/src/workforce/brains/employeeBrain';
import {
  createWorkforceSession,
  hairSessionCookieOptions as wfCookieOptions,
} from '@/src/workforce/auth/session';
import { normalizeMobile } from '@/src/workforce/auth/mobile';
import { employeeToHairAdmin } from '@/src/workforce/compat/hairAdminBridge';
import { defaultGrantsFor } from '@/src/workforce/permissions/presets';

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  await requireHairHost();
  const loginId = String(formData.get('email') ?? formData.get('mobile') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '');
  const rememberMe = String(formData.get('rememberMe') ?? '') === 'on';

  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rateLimit = checkLoginRateLimit(ip);
  if (!rateLimit.allowed) {
    return { error: 'Too many attempts. Try again later.' };
  }

  if (isWorkforceEngineEnabled()) {
    const mobile = normalizeMobile(loginId);
    const employee = mobile
      ? await findEmployeeByMobile(mobile)
      : null;

    // Fallback: email on employee or legacy admin email during transition
    let emp = employee;
    if (!emp && loginId.includes('@')) {
      const [byEmail] = await hairDb
        .select()
        .from(fyhAdminUsers)
        .where(eq(fyhAdminUsers.email, loginId.toLowerCase()))
        .limit(1);
      if (byEmail) {
        emp = await findEmployeeByLegacyAdminId(byEmail.id);
        if (emp && emp.passwordHash && verifyPassword(password, emp.passwordHash)) {
          // ok
        } else if (byEmail && verifyPassword(password, byEmail.passwordHash)) {
          // Legacy admin still works if not migrated — fall through below
          emp = null;
        } else {
          return { error: 'Invalid credentials' };
        }
      }
    }

    if (emp) {
      if (!emp.canLogin || !emp.passwordHash || emp.status !== 'active') {
        return { error: 'Invalid credentials' };
      }
      if (!verifyPassword(password, emp.passwordHash)) {
        return { error: 'Invalid credentials' };
      }

      resetLoginRateLimit(ip);
      const memberships = await listMemberships(emp.id);
      const live = memberships.filter((m) => m.engineId === 'fyh_salon');
      const activeEngine = live[0]?.engineId ?? memberships[0]?.engineId ?? 'fyh_salon';
      const { token, maxAgeDays } = await createWorkforceSession(
        emp.id,
        rememberMe,
        activeEngine,
      );
      const cookieStore = await cookies();
      cookieStore.set(
        HAIR_SESSION_COOKIE,
        token,
        wfCookieOptions(process.env.NODE_ENV === 'production', maxAgeDays * 24 * 60 * 60),
      );

      const salon = memberships.find((m) => m.engineId === 'fyh_salon') ?? memberships[0];
      if (salon?.rank === 'team_member') {
        redirect(safeHairNextPath(next || '/me', {
          role: 'admin',
          permissions: [],
        }));
      }

      const grants =
        (salon
          ? await resolvePermissions(emp.id, salon.engineId)
          : null) ?? defaultGrantsFor(salon?.rank ?? 'team_member', salon?.jobRole ?? 'stylist');
      const admin = employeeToHairAdmin(emp, salon?.rank ?? 'team_member', grants);
      const home =
        salon?.rank === 'owner' || salon?.rank === 'manager'
          ? '/workforce/home'
          : resolveDefaultLandingPath(admin);
      redirect(safeHairNextPath(next || home, admin));
    }
  }

  const email = loginId.toLowerCase();
  const [admin] = await hairDb
    .select()
    .from(fyhAdminUsers)
    .where(eq(fyhAdminUsers.email, email))
    .limit(1);

  if (!admin || !verifyPassword(password, admin.passwordHash)) {
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
