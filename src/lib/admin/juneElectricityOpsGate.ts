/**
 * Gate for the one-time June 2026 electricity generation admin UI.
 * Disabled after a successful run (audit log) or when ENABLE_JUNE_ELECTRICITY_OPS_UI=0.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog } from '@/src/db/schema';

export const JUNE_ELECTRICITY_OPS_ENTITY = 'one_time_ops';
export const JUNE_ELECTRICITY_OPS_ACTION = 'june_electricity_generation_completed';
export const JUNE_ELECTRICITY_OPS_ENTITY_ID = '00000000-0000-4000-a000-000000000001';

export type JuneElectricityOpsGate = {
  enabled: boolean;
  completed: boolean;
  completedAt: Date | null;
  completedByAdminId: string | null;
  reason: string | null;
};

function envAllowsUi(): boolean {
  const raw = process.env.ENABLE_JUNE_ELECTRICITY_OPS_UI?.trim();
  if (raw === '0' || raw?.toLowerCase() === 'false') return false;
  return true;
}

export async function getJuneElectricityOpsGate(): Promise<JuneElectricityOpsGate> {
  if (!envAllowsUi()) {
    return {
      enabled: false,
      completed: false,
      completedAt: null,
      completedByAdminId: null,
      reason: 'Feature flag disabled (ENABLE_JUNE_ELECTRICITY_OPS_UI=0)',
    };
  }

  const [row] = await db
    .select({
      createdAt: auditLog.createdAt,
      actorId: auditLog.actorId,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entity, JUNE_ELECTRICITY_OPS_ENTITY),
        eq(auditLog.action, JUNE_ELECTRICITY_OPS_ACTION),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(1);

  if (row) {
    return {
      enabled: false,
      completed: true,
      completedAt: row.createdAt,
      completedByAdminId: row.actorId,
      reason: 'Already completed successfully',
    };
  }

  return {
    enabled: true,
    completed: false,
    completedAt: null,
    completedByAdminId: null,
    reason: null,
  };
}

export async function markJuneElectricityOpsCompleted(adminId: string): Promise<void> {
  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: adminId,
    entity: JUNE_ELECTRICITY_OPS_ENTITY,
    entityId: JUNE_ELECTRICITY_OPS_ENTITY_ID,
    action: JUNE_ELECTRICITY_OPS_ACTION,
    diff: { billingMonth: '2026-06-01', rooms: ['101', '102', '201', '202', '203', '204'] },
  });
}
