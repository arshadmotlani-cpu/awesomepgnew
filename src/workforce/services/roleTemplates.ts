import { and, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { wfRoleTemplates } from '@/src/workforce/db/schema';
import { normalizeAccessRole } from '@/src/workforce/accessRoles';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import type { WorkforceEngineId, WorkforceJobRole } from '@/src/workforce/types';
import type { WorkforcePermissionGrants, WorkforcePermissionKey } from '@/src/workforce/types';

export async function getRoleTemplateFromDb(
  engineId: WorkforceEngineId | string,
  accessRole: WorkforceJobRole,
): Promise<WorkforcePermissionGrants | null> {
  const role = normalizeAccessRole(accessRole);
  const [row] = await hairDb
    .select()
    .from(wfRoleTemplates)
    .where(and(eq(wfRoleTemplates.engineId, engineId as WorkforceEngineId), eq(wfRoleTemplates.accessRole, role)))
    .limit(1);
  if (!row) return null;
  return {
    permissions: (row.permissions ?? []) as WorkforcePermissionKey[],
    maxBackdateDays: row.maxBackdateDays,
  };
}

export async function listRoleTemplates(engineId: WorkforceEngineId = 'fyh_salon') {
  const rows = await hairDb
    .select()
    .from(wfRoleTemplates)
    .where(eq(wfRoleTemplates.engineId, engineId));
  return rows;
}

export async function upsertRoleTemplate(input: {
  engineId?: WorkforceEngineId;
  accessRole: WorkforceJobRole;
  permissions: WorkforcePermissionKey[];
  maxBackdateDays: number | null;
}) {
  const engineId = input.engineId ?? 'fyh_salon';
  const accessRole = normalizeAccessRole(input.accessRole);
  const [existing] = await hairDb
    .select({ id: wfRoleTemplates.id })
    .from(wfRoleTemplates)
    .where(and(eq(wfRoleTemplates.engineId, engineId), eq(wfRoleTemplates.accessRole, accessRole)))
    .limit(1);

  if (existing) {
    await hairDb
      .update(wfRoleTemplates)
      .set({
        permissions: input.permissions,
        maxBackdateDays: input.maxBackdateDays,
        updatedAt: new Date(),
      })
      .where(eq(wfRoleTemplates.id, existing.id));
    return;
  }

  await hairDb.insert(wfRoleTemplates).values({
    engineId,
    accessRole,
    permissions: input.permissions,
    maxBackdateDays: input.maxBackdateDays,
  });
}

/** Seed DB templates from code defaults when table is empty for an engine. */
export async function ensureRoleTemplatesSeeded(engineId: WorkforceEngineId = 'fyh_salon') {
  const existing = await listRoleTemplates(engineId);
  if (existing.length > 0) return;

  const roles: WorkforceJobRole[] = [
    'owner',
    'manager',
    'receptionist',
    'stylist',
    'barber',
    'beautician',
    'makeup_artist',
    'nail_technician',
    'hair_assistant',
    'cleaner',
    'accountant',
    'inventory_manager',
    'intern',
  ];

  for (const role of roles) {
    const tpl = codeTemplateForAccessRole(role);
    await upsertRoleTemplate({
      engineId,
      accessRole: role,
      permissions: tpl.permissions,
      maxBackdateDays: tpl.maxBackdateDays,
    });
  }
}
