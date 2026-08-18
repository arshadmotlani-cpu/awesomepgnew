'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhAdminUsers } from '@/src/hair/db/schema';
import { HAIR_SESSION_COOKIE } from '@/src/hair/lib/auth/constants';
import { FYH_ORG_COOKIE, FYH_LOCATION_COOKIE } from '@/src/hair/lib/tenant/cookies';
import { listActiveMembershipsForUser } from '@/src/platform/services/memberships';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
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
  listMemberships,
  resolvePermissions,
} from '@/src/workforce/brains/employeeBrain';
import {
  createWorkforceSession,
  hairSessionCookieOptions as wfCookieOptions,
} from '@/src/workforce/auth/session';
import { findEmployeeByLoginId } from '@/src/workforce/auth/identity';
import { employeeToHairAdmin } from '@/src/workforce/compat/hairAdminBridge';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import { hasWorkforcePermission } from '@/src/workforce/permissions/resolve';

async function setTenantCookiesForUser(userId: string) {
  if (!isFyhSaasTenantEnabled()) return;
  const memberships = await listActiveMembershipsForUser(userId);
  if (memberships.length !== 1) return;
  const membership = memberships[0]!;
  const cookieStore = await cookies();
  cookieStore.set(FYH_ORG_COOKIE, membership.organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  });
  const locationId = membership.allowedLocationIds[0];
  if (locationId) {
    cookieStore.set(FYH_LOCATION_COOKIE, locationId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 365 * 24 * 60 * 60,
    });
  }
}

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
    let emp = await findEmployeeByLoginId(loginId);

    // Fallback: legacy admin email during transition
    if (!emp && loginId.includes('@')) {
      const [byEmail] = await hairDb
        .select()
        .from(fyhAdminUsers)
        .where(eq(fyhAdminUsers.email, loginId.toLowerCase()))
        .limit(1);
      if (byEmail) {
        emp = await findEmployeeByLegacyAdminId(byEmail.id);
        if (emp && emp.passwordHash && verifyPassword(password, emp.passwordHash)) {
          // workforce employee matched
        } else if (byEmail && verifyPassword(password, byEmail.passwordHash)) {
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
      const grants =
        (salon
          ? await resolvePermissions(emp.id, salon.engineId)
          : null) ?? codeTemplateForAccessRole(salon?.jobRole ?? 'staff');
      const admin = employeeToHairAdmin(emp, grants);

      if (emp.userId && isFyhSaasTenantEnabled()) {
        const platformMemberships = await listActiveMembershipsForUser(emp.userId);
        if (platformMemberships.length > 1) {
          redirect(safeHairNextPath('/select-organization', admin));
        }
        await setTenantCookiesForUser(emp.userId);
      }

      const home = hasWorkforcePermission(grants, 'staff.view')
        ? '/workforce/home'
        : hasWorkforcePermission(grants, 'appointments.view_own') &&
            !hasWorkforcePermission(grants, 'appointments.view_all')
          ? '/me'
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
