import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { wfEmployees } from '@/src/workforce/db/schema';
import { normalizeMobile } from '@/src/workforce/auth/mobile';

/** Normalize email for Workforce login + uniqueness. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = (raw ?? '').trim().toLowerCase();
  if (!email || !email.includes('@') || email.length < 5) return null;
  return email;
}

export async function findEmployeeByEmail(emailRaw: string) {
  const email = normalizeEmail(emailRaw);
  if (!email) return null;
  const [row] = await hairDb
    .select()
    .from(wfEmployees)
    .where(eq(wfEmployees.email, email))
    .limit(1);
  return row ?? null;
}

async function findEmployeeByMobileDirect(mobileRaw: string) {
  const mobile = normalizeMobile(mobileRaw);
  if (!mobile) return null;
  const [row] = await hairDb
    .select()
    .from(wfEmployees)
    .where(eq(wfEmployees.mobile, mobile))
    .limit(1);
  return row ?? null;
}

/** Resolve employee by phone or email login id. */
export async function findEmployeeByLoginId(loginId: string) {
  const trimmed = loginId.trim();
  if (!trimmed) return null;

  const byMobile = await findEmployeeByMobileDirect(trimmed);
  if (byMobile) return byMobile;

  if (trimmed.includes('@')) {
    return findEmployeeByEmail(trimmed);
  }

  return null;
}

/** Fields required to decide whether a wf_employees row may authenticate (not POS-only). */
export type WorkforceAuthenticationIdentity = Pick<
  typeof wfEmployees.$inferSelect,
  'canLogin' | 'status' | 'passwordHash'
>;

/**
 * True when this workforce row is an intentional login account.
 * Non-login staff rows (can_login=false, missing hash) must not participate in auth.
 */
export function isWorkforceAuthenticationIdentity(
  emp: WorkforceAuthenticationIdentity | null | undefined,
): boolean {
  if (!emp) return false;
  return (
    emp.canLogin === true &&
    emp.status === 'active' &&
    Boolean(emp.passwordHash?.trim())
  );
}

/** Drop workforce matches that must not block legacy admin login for the same login id. */
export function workforceEmployeeForAuthentication<T extends WorkforceAuthenticationIdentity>(
  emp: T | null,
): T | null {
  if (!emp || !isWorkforceAuthenticationIdentity(emp)) return null;
  return emp;
}

/** When true, failed password must not fall through to fyh_admin_users for the same id. */
export function workforceLoginExclusive(emp: WorkforceAuthenticationIdentity | null): boolean {
  return isWorkforceAuthenticationIdentity(emp);
}
