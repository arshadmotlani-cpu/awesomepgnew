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
