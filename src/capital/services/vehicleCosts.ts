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

/** Mark cost rows linked to an activity as reversed (keeps TVI SSOT in sync). */
export async function reverseVehicleCostsForActivity(
  activityId: string,
  db: CapitalDbClient = capitalDb,
) {
  await db
    .update(acVehicleCosts)
    .set({ isReversed: true, updatedAt: new Date() })
    .where(
      and(eq(acVehicleCosts.activityId, activityId), eq(acVehicleCosts.isReversed, false)),
    );
}

/** Update amount/title/notes on the live cost row linked to an activity. */
export async function updateVehicleCostForActivity(
  input: {
    activityId: string;
    amountPaise: number;
    occurredAt?: string;
    title?: string | null;
    notes?: string | null;
  },
  db: CapitalDbClient = capitalDb,
) {
  const [row] = await db
    .select()
    .from(acVehicleCosts)
    .where(
      and(eq(acVehicleCosts.activityId, input.activityId), eq(acVehicleCosts.isReversed, false)),
    )
    .limit(1);
  if (!row) return null;

  const [updated] = await db
    .update(acVehicleCosts)
    .set({
      amountPaise: Math.round(input.amountPaise),
      occurredAt: input.occurredAt ?? row.occurredAt,
      title: input.title !== undefined ? input.title : row.title,
      notes: input.notes !== undefined ? input.notes : row.notes,
      updatedAt: new Date(),
    })
    .where(eq(acVehicleCosts.id, row.id))
    .returning();
  return updated ?? null;
}

/** Free-text cost or refund row — Investment SSOT. */
export async function recordFreeTextCost(
  input: {
    assetId: string;
    title: string;
    amountPaise: number;
    occurredAt: string;
    entryKind?: 'cost' | 'refund';
    notes?: string | null;
  },
  db: CapitalDbClient = capitalDb,
) {
  const title = input.title.trim();
  if (!title) throw new Error('Title is required');
  let amountPaise = Math.round(input.amountPaise);
  if (amountPaise === 0) throw new Error('Amount must be non-zero');

  const entryKind =
    input.entryKind ?? (amountPaise < 0 ? 'refund' : 'cost');
  if (entryKind === 'refund' && amountPaise > 0) {
    amountPaise = -Math.abs(amountPaise);
  }
  if (entryKind === 'cost' && amountPaise < 0) {
    amountPaise = Math.abs(amountPaise);
  }

  const [row] = await db
    .insert(acVehicleCosts)
    .values({
      assetId: input.assetId,
      costType: entryKind === 'refund' ? 'refund' : 'miscellaneous',
      entryKind,
      amountPaise,
      occurredAt: input.occurredAt,
      title,
      notes: input.notes ?? null,
    })
    .returning();

  return row;
}

export async function reverseVehicleCost(costId: string, db: CapitalDbClient = capitalDb) {
  await db
    .update(acVehicleCosts)
    .set({ isReversed: true, updatedAt: new Date() })
    .where(eq(acVehicleCosts.id, costId));
}

export { summarizeVehicleCostBreakdown } from '@/src/capital/lib/threeLedgers';
