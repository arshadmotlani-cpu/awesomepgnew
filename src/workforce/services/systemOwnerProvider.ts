import { and, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhAdminUsers } from '@/src/hair/db/schema';
import {
  wfEmployees,
  wfEngineMemberships,
  wfPermissionGrants,
} from '@/src/workforce/db/schema';
import { findEmployeeByLegacyAdminId } from '@/src/workforce/brains/employeeBrain';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import { createEmployee } from '@/src/workforce/services/employees';
import type { WorkforceEngineId } from '@/src/workforce/types';

/** Fixed display name for the salon system owner provider. */
export const SYSTEM_OWNER_DISPLAY_NAME = 'Arshad';

/** Stable UUID when no super_admin employee exists yet (single-salon bootstrap). */
export const SYSTEM_OWNER_PROVIDER_ID = '00000000-0000-4000-8000-000000000001';

let ensurePromise: Promise<string | null> | null = null;

async function ensureReceiveBookings(employeeId: string, engineId: WorkforceEngineId) {
  const [mem] = await hairDb
    .select()
    .from(wfEngineMemberships)
    .where(
      and(
        eq(wfEngineMemberships.employeeId, employeeId),
        eq(wfEngineMemberships.engineId, engineId),
      ),
    )
    .limit(1);
  if (!mem) return;

  const [pg] = await hairDb
    .select()
    .from(wfPermissionGrants)
    .where(eq(wfPermissionGrants.membershipId, mem.id))
    .limit(1);

  const template = codeTemplateForAccessRole('owner');
  const permissions = [...template.permissions];
  if (!permissions.includes('appointments.receive_bookings')) {
    permissions.push('appointments.receive_bookings');
  }

  if (pg) {
    if (pg.usesRoleTemplate) return;
    const merged = [...new Set([...pg.permissions, 'appointments.receive_bookings'])];
    await hairDb
      .update(wfPermissionGrants)
      .set({ permissions: merged, updatedAt: new Date() })
      .where(eq(wfPermissionGrants.id, pg.id));
  } else {
    await hairDb.insert(wfPermissionGrants).values({
      membershipId: mem.id,
      permissions,
      maxBackdateDays: template.maxBackdateDays,
      usesRoleTemplate: true,
    });
  }
}

/**
 * Idempotent: ensure permanent owner provider exists and is bookable.
 * Links to super_admin legacy login when present; otherwise bootstraps a fixed row.
 */
export async function ensureSalonOwnerProvider(
  engineId: WorkforceEngineId = 'fyh_salon',
): Promise<string | null> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const [existingProvider] = await hairDb
        .select({ id: wfEmployees.id })
        .from(wfEmployees)
        .where(eq(wfEmployees.isSystemProvider, true))
        .limit(1);
      if (existingProvider) {
        await hairDb
          .update(wfEmployees)
          .set({
            fullName: SYSTEM_OWNER_DISPLAY_NAME,
            status: 'active',
            updatedAt: new Date(),
          })
          .where(eq(wfEmployees.id, existingProvider.id));
        await ensureReceiveBookings(existingProvider.id, engineId);
        return existingProvider.id;
      }

      const [superAdmin] = await hairDb
        .select()
        .from(fyhAdminUsers)
        .where(eq(fyhAdminUsers.role, 'super_admin'))
        .limit(1);

      if (superAdmin) {
        const linked = await findEmployeeByLegacyAdminId(superAdmin.id);
        if (linked) {
          await hairDb
            .update(wfEmployees)
            .set({
              isSystemProvider: true,
              fullName: SYSTEM_OWNER_DISPLAY_NAME,
              status: 'active',
              updatedAt: new Date(),
            })
            .where(eq(wfEmployees.id, linked.id));
          await ensureReceiveBookings(linked.id, engineId);
          return linked.id;
        }
      }

      const emp = await createEmployee({
        id: SYSTEM_OWNER_PROVIDER_ID,
        fullName: SYSTEM_OWNER_DISPLAY_NAME,
        accessRole: 'owner',
        receiveBookings: true,
        status: 'active',
        isSystemProvider: true,
        engineId,
      });
      return emp.id;
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}

export function isSystemProviderEmployee(employee: { isSystemProvider?: boolean }): boolean {
  return Boolean(employee.isSystemProvider);
}
