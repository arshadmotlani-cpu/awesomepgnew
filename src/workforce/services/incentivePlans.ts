import { and, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { wfIncentivePlans } from '@/src/workforce/db/schema';
import type { WorkforceEngineId } from '@/src/workforce/types';
import type {
  WorkforceIncentivePlanConfig,
  WorkforceIncentivePlanInput,
  WorkforceIncentivePlanType,
} from '@/src/workforce/types/hr';

export async function getIncentivePlan(
  employeeId: string,
  engineId: WorkforceEngineId = 'fyh_salon',
) {
  const [row] = await hairDb
    .select()
    .from(wfIncentivePlans)
    .where(
      and(eq(wfIncentivePlans.employeeId, employeeId), eq(wfIncentivePlans.engineId, engineId)),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertIncentivePlan(input: {
  employeeId: string;
  engineId?: WorkforceEngineId;
  plan: WorkforceIncentivePlanInput;
}) {
  const engineId = input.engineId ?? 'fyh_salon';
  const [existing] = await hairDb
    .select({ id: wfIncentivePlans.id })
    .from(wfIncentivePlans)
    .where(
      and(
        eq(wfIncentivePlans.employeeId, input.employeeId),
        eq(wfIncentivePlans.engineId, engineId),
      ),
    )
    .limit(1);

  const values = {
    planType: input.plan.planType,
    config: input.plan.config as WorkforceIncentivePlanConfig,
    effectiveFrom: input.plan.effectiveFrom ?? null,
    updatedAt: new Date(),
  };

  if (existing) {
    await hairDb.update(wfIncentivePlans).set(values).where(eq(wfIncentivePlans.id, existing.id));
  } else {
    await hairDb.insert(wfIncentivePlans).values({
      employeeId: input.employeeId,
      engineId,
      ...values,
    });
  }
}

export function isPercentageThresholdConfig(
  planType: WorkforceIncentivePlanType,
  config: unknown,
): config is import('@/src/workforce/types/hr').PercentageThresholdIncentiveConfig {
  return (
    planType === 'percentage_threshold' &&
    typeof config === 'object' &&
    config !== null &&
    'thresholdMultiplier' in config
  );
}
