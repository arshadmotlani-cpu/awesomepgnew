/**
 * Audit trail for the one-time June 2026 electricity production migration.
 * Not tied to any admin UI — used by scripts and build hooks only.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog } from '@/src/db/schema';

export const JUNE_ELECTRICITY_OPS_ENTITY = 'one_time_ops';
export const JUNE_ELECTRICITY_OPS_ACTION = 'june_electricity_generation_completed';
export const JUNE_ELECTRICITY_OPS_ENTITY_ID = '00000000-0000-4000-a000-000000000001';

export type JuneElectricityOpsCompletion = {
  completed: boolean;
  completedAt: Date | null;
  completedByAdminId: string | null;
};

export async function getJuneElectricityOpsCompletion(): Promise<JuneElectricityOpsCompletion> {
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

  if (!row) {
    return { completed: false, completedAt: null, completedByAdminId: null };
  }

  return {
    completed: true,
    completedAt: row.createdAt,
    completedByAdminId: row.actorId,
  };
}

export async function markJuneElectricityOpsCompleted(adminId: string): Promise<void> {
  const existing = await getJuneElectricityOpsCompletion();
  if (existing.completed) return;

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: adminId,
    entity: JUNE_ELECTRICITY_OPS_ENTITY,
    entityId: JUNE_ELECTRICITY_OPS_ENTITY_ID,
    action: JUNE_ELECTRICITY_OPS_ACTION,
    diff: { billingMonth: '2026-06-01', rooms: ['101', '102', '201', '202', '203', '204'] },
  });
}
