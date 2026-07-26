import { and, eq } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import { acVehicleCosts, type VehicleCostType } from '@/src/capital/db/schema';
import type { CapitalDbClient } from '@/src/capital/lib/db/types';
import { VEHICLE_COST_TYPE_LABELS } from '@/src/capital/lib/threeLedgers';

const ACTIVITY_TO_COST: Partial<Record<string, VehicleCostType>> = {
  broker_commission: 'broker_commission',
  transport: 'transport',
  repair_settlement: 'repair_settlement',
  fuel: 'fuel',
  insurance: 'insurance',
  accessories: 'accessories',
  washing: 'washing',
  service: 'service',
  rto: 'rto',
  storage: 'storage',
  miscellaneous: 'miscellaneous',
};

export function activityTypeToCostType(activityType: string): VehicleCostType | null {
  if (activityType in ACTIVITY_TO_COST) {
    return ACTIVITY_TO_COST[activityType] ?? null;
  }
  return null;
}

/** Persist a Vehicle Cost ledger row (enters TVI). */
export async function insertVehicleCost(
  input: {
    assetId: string;
    costType: VehicleCostType;
    amountPaise: number;
    occurredAt: string;
    title?: string | null;
    notes?: string | null;
    activityId?: string | null;
    ledgerEntryId?: string | null;
  },
  db: CapitalDbClient = capitalDb,
) {
  const amountPaise = Math.round(input.amountPaise);

  const [row] = await db
    .insert(acVehicleCosts)
    .values({
      assetId: input.assetId,
      costType: input.costType,
      amountPaise,
      occurredAt: input.occurredAt,
      title: input.title ?? VEHICLE_COST_TYPE_LABELS[input.costType],
      notes: input.notes ?? null,
      activityId: input.activityId ?? null,
      ledgerEntryId: input.ledgerEntryId ?? null,
    })
    .returning();

  return row;
}

export async function listVehicleCosts(assetId: string, db: CapitalDbClient = capitalDb) {
  return db
    .select()
    .from(acVehicleCosts)
    .where(and(eq(acVehicleCosts.assetId, assetId), eq(acVehicleCosts.isReversed, false)));
}
