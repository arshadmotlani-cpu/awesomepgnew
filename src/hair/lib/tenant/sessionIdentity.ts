import { hairDb } from '@/src/hair/db/client';
import { wfEmployees } from '@/src/workforce/db/schema';
import { eq } from 'drizzle-orm';
import { findPlatformUserIdByEmail } from '@/src/platform/services/memberships';

export type HairSessionIdentityInput = {
  workforceEmployeeId?: string;
  adminId: string;
  adminEmail: string | null;
};

export type EmployeeIdentityRow = {
  id: string;
  userId: string | null;
  legacyAdminUserId: string | null;
  email: string | null;
};

/** Legacy FYH admin sessions must still map to a workforce employee + platform userId. */
export function pickEmployeeForHairSession(
  session: HairSessionIdentityInput,
  employees: EmployeeIdentityRow[],
): EmployeeIdentityRow | null {
  if (session.workforceEmployeeId) {
    const hit = employees.find((e) => e.id === session.workforceEmployeeId);
    if (hit) return hit;
  }
  const byLegacy = employees.find((e) => e.legacyAdminUserId === session.adminId);
  if (byLegacy) return byLegacy;
  const email = session.adminEmail?.trim().toLowerCase();
  if (email) {
    const byEmail = employees.find((e) => e.email?.trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  return null;
}

export async function loadLinkedWorkforceEmployee(
  session: HairSessionIdentityInput,
): Promise<EmployeeIdentityRow | null> {
  const rows: EmployeeIdentityRow[] = [];
  if (session.workforceEmployeeId) {
    const [byId] = await hairDb
      .select({
        id: wfEmployees.id,
        userId: wfEmployees.userId,
        legacyAdminUserId: wfEmployees.legacyAdminUserId,
        email: wfEmployees.email,
      })
      .from(wfEmployees)
      .where(eq(wfEmployees.id, session.workforceEmployeeId))
      .limit(1);
    if (byId) rows.push(byId);
  }
  const [byLegacy] = await hairDb
    .select({
      id: wfEmployees.id,
      userId: wfEmployees.userId,
      legacyAdminUserId: wfEmployees.legacyAdminUserId,
      email: wfEmployees.email,
    })
    .from(wfEmployees)
    .where(eq(wfEmployees.legacyAdminUserId, session.adminId))
    .limit(1);
  if (byLegacy) rows.push(byLegacy);
  const email = session.adminEmail?.trim().toLowerCase();
  if (email) {
    const [byEmail] = await hairDb
      .select({
        id: wfEmployees.id,
        userId: wfEmployees.userId,
        legacyAdminUserId: wfEmployees.legacyAdminUserId,
        email: wfEmployees.email,
      })
      .from(wfEmployees)
      .where(eq(wfEmployees.email, email))
      .limit(1);
    if (byEmail) rows.push(byEmail);
  }
  return pickEmployeeForHairSession(session, rows);
}

export async function resolvePlatformUserIdForHairSession(
  session: HairSessionIdentityInput,
): Promise<string | null> {
  const linked = await loadLinkedWorkforceEmployee(session);
  if (linked?.userId) return linked.userId;
  if (session.adminEmail) return findPlatformUserIdByEmail(session.adminEmail);
  return null;
}
