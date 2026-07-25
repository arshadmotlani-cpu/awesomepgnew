import { and, asc, desc, eq } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import {
  acRepairAdvances,
  acVehicleActivities,
} from '@/src/capital/db/schema';
import {
  VEHICLE_ACTIVITY_TYPE_META,
  computeRepairSettlement,
  isVehicleActivityType,
  type VehicleActivityType,
} from '@/src/capital/lib/activityTypes';
import { rupeesToPaise } from '@/src/capital/lib/money';
import type { CapitalDbClient } from '@/src/capital/lib/db/types';
import { postLedgerEntry } from './ledger';
import { logActivity } from './activity';
import { assertAssetMutable, recalculateAsset } from './assets';
import { assertAssetAcceptsExpenses } from '@/src/capital/lib/assetLifecycle';

export type CreateVehicleActivityInput = {
  assetId: string;
  activityType: VehicleActivityType;
  activityAt: string;
  amountPaise?: number | null;
  title?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  documentId?: string | null;
  /** Repair settlement */
  actualCostPaise?: number;
  returnedPaise?: number;
  repairAdvanceId?: string;
};

export async function listVehicleActivities(assetId: string, db: CapitalDbClient = capitalDb) {
  return db
    .select()
    .from(acVehicleActivities)
    .where(
      and(eq(acVehicleActivities.assetId, assetId), eq(acVehicleActivities.isReversed, false)),
    )
    .orderBy(desc(acVehicleActivities.activityAt), desc(acVehicleActivities.createdAt));
}

export async function listOpenRepairAdvances(assetId: string, db: CapitalDbClient = capitalDb) {
  return db
    .select()
    .from(acRepairAdvances)
    .where(and(eq(acRepairAdvances.assetId, assetId), eq(acRepairAdvances.status, 'open')))
    .orderBy(asc(acRepairAdvances.createdAt));
}

export async function createVehicleActivity(input: CreateVehicleActivityInput) {
  if (!isVehicleActivityType(input.activityType)) {
    throw new Error('Invalid activity type');
  }
  const meta = VEHICLE_ACTIVITY_TYPE_META[input.activityType];
  await assertAssetAcceptsExpenses(input.assetId);
  await assertAssetMutable(input.assetId);

  if (input.activityType === 'repair_advance') {
    return createRepairAdvanceActivity(input);
  }
  if (input.activityType === 'repair_settlement') {
    return settleRepairAdvanceActivity(input);
  }

  if (meta.requiresAmount) {
    const amt = Math.round(input.amountPaise ?? 0);
    if (amt === 0) throw new Error('Amount is required for this activity');
  }

  return capitalDb.transaction(async (tx) => {
    const amountPaise =
      input.amountPaise != null ? Math.round(input.amountPaise) : null;
    const title = input.title?.trim() || meta.label;

    const [row] = await tx
      .insert(acVehicleActivities)
      .values({
        assetId: input.assetId,
        activityType: input.activityType,
        activityAt: input.activityAt,
        amountPaise,
        title,
        notes: input.notes,
        metadata: input.metadata ?? {},
        documentId: input.documentId ?? null,
      })
      .returning();

    let ledgerEntryId: string | null = null;
    if (amountPaise != null && amountPaise !== 0 && meta.ledgerDirection) {
      const abs = Math.abs(amountPaise);
      const direction =
        amountPaise < 0
          ? meta.ledgerDirection === 'debit'
            ? 'credit'
            : 'debit'
          : meta.ledgerDirection;
      const entry = await postLedgerEntry(
        {
          entryType: meta.costImpact === 'vehicle_cost' ? 'expense' : 'adjustment',
          direction,
          amountPaise: abs,
          assetId: input.assetId,
          sourceTable: 'ac_vehicle_activities',
          sourceId: row.id,
          description: `${meta.label}: ${title}`,
        },
        tx,
      );
      ledgerEntryId = entry.id;
      await tx
        .update(acVehicleActivities)
        .set({ ledgerEntryId, updatedAt: new Date() })
        .where(eq(acVehicleActivities.id, row.id));
    }

    await logActivity(
      {
        action: 'vehicle_activity_created',
        entityType: 'asset',
        entityId: input.assetId,
        afterState: {
          activityId: row.id,
          activityType: input.activityType,
          amountPaise,
        },
      },
      tx,
    );

    await recalculateAsset(input.assetId, tx);
    return row;
  });
}

async function createRepairAdvanceActivity(input: CreateVehicleActivityInput) {
  const advancePaise = Math.round(input.amountPaise ?? 0);
  if (advancePaise <= 0) throw new Error('Repair advance amount must be positive');

  return capitalDb.transaction(async (tx) => {
    const [advance] = await tx
      .insert(acRepairAdvances)
      .values({
        assetId: input.assetId,
        advancePaise,
        outstandingPaise: advancePaise,
        returnedPaise: 0,
        status: 'open',
        notes: input.notes,
      })
      .returning();

    const [activity] = await tx
      .insert(acVehicleActivities)
      .values({
        assetId: input.assetId,
        activityType: 'repair_advance',
        activityAt: input.activityAt,
        amountPaise: advancePaise,
        title: input.title?.trim() || 'Repair Advance',
        notes: input.notes,
        repairAdvanceId: advance.id,
        metadata: { repairAdvanceId: advance.id },
      })
      .returning();

    const entry = await postLedgerEntry(
      {
        entryType: 'adjustment',
        direction: 'debit',
        amountPaise: advancePaise,
        assetId: input.assetId,
        sourceTable: 'ac_vehicle_activities',
        sourceId: activity.id,
        description: `Repair advance: ₹${(advancePaise / 100).toLocaleString('en-IN')}`,
        metadata: { kind: 'repair_advance', repairAdvanceId: advance.id },
      },
      tx,
    );

    await tx
      .update(acVehicleActivities)
      .set({ ledgerEntryId: entry.id, updatedAt: new Date() })
      .where(eq(acVehicleActivities.id, activity.id));

    await tx
      .update(acRepairAdvances)
      .set({ advanceActivityId: activity.id, updatedAt: new Date() })
      .where(eq(acRepairAdvances.id, advance.id));

    await logActivity(
      {
        action: 'repair_advance_created',
        entityType: 'asset',
        entityId: input.assetId,
        afterState: { advanceId: advance.id, advancePaise },
      },
      tx,
    );

    // Advance does not change vehicle cost
    await recalculateAsset(input.assetId, tx);
    return activity;
  });
}

async function settleRepairAdvanceActivity(input: CreateVehicleActivityInput) {
  const actualCostPaise = Math.round(input.actualCostPaise ?? 0);
  const returnedPaise = Math.round(input.returnedPaise ?? 0);
  if (actualCostPaise < 0) throw new Error('Actual repair cost cannot be negative');
  if (returnedPaise < 0) throw new Error('Returned amount cannot be negative');

  return capitalDb.transaction(async (tx) => {
    let advance;
    if (input.repairAdvanceId) {
      const [row] = await tx
        .select()
        .from(acRepairAdvances)
        .where(
          and(
            eq(acRepairAdvances.id, input.repairAdvanceId),
            eq(acRepairAdvances.assetId, input.assetId),
            eq(acRepairAdvances.status, 'open'),
          ),
        )
        .limit(1);
      advance = row;
    } else {
      const [row] = await tx
        .select()
        .from(acRepairAdvances)
        .where(
          and(eq(acRepairAdvances.assetId, input.assetId), eq(acRepairAdvances.status, 'open')),
        )
        .orderBy(asc(acRepairAdvances.createdAt))
        .limit(1);
      advance = row;
    }
    if (!advance) throw new Error('No open repair advance to settle');

    const { outstandingPaise } = computeRepairSettlement({
      advancePaise: advance.advancePaise,
      actualCostPaise,
      returnedPaise,
    });

    const [activity] = await tx
      .insert(acVehicleActivities)
      .values({
        assetId: input.assetId,
        activityType: 'repair_settlement',
        activityAt: input.activityAt,
        amountPaise: actualCostPaise,
        title: input.title?.trim() || 'Repair Settlement',
        notes: input.notes,
        repairAdvanceId: advance.id,
        metadata: {
          repairAdvanceId: advance.id,
          advancePaise: advance.advancePaise,
          actualCostPaise,
          returnedPaise,
          outstandingPaise,
        },
      })
      .returning();

    // Clear advance float, then book actual cost.
    // Net with day-1 advance debit: cash out = actualCost (+ any still-held outstanding).
    await postLedgerEntry(
      {
        entryType: 'adjustment',
        direction: 'credit',
        amountPaise: advance.advancePaise,
        assetId: input.assetId,
        sourceTable: 'ac_vehicle_activities',
        sourceId: activity.id,
        description: `Clear repair advance float: ₹${(advance.advancePaise / 100).toLocaleString('en-IN')}`,
        metadata: { kind: 'repair_advance_clear', repairAdvanceId: advance.id },
      },
      tx,
    );

    if (actualCostPaise > 0) {
      const costEntry = await postLedgerEntry(
        {
          entryType: 'expense',
          direction: 'debit',
          amountPaise: actualCostPaise,
          assetId: input.assetId,
          sourceTable: 'ac_vehicle_activities',
          sourceId: activity.id,
          description: `Repair actual cost: ₹${(actualCostPaise / 100).toLocaleString('en-IN')}`,
          metadata: { kind: 'repair_settlement_cost', repairAdvanceId: advance.id },
        },
        tx,
      );
      await tx
        .update(acVehicleActivities)
        .set({ ledgerEntryId: costEntry.id, updatedAt: new Date() })
        .where(eq(acVehicleActivities.id, activity.id));
    }

    // Mechanic still holds cash after settlement accounting
    if (outstandingPaise > 0) {
      await postLedgerEntry(
        {
          entryType: 'adjustment',
          direction: 'debit',
          amountPaise: outstandingPaise,
          assetId: input.assetId,
          sourceTable: 'ac_vehicle_activities',
          sourceId: activity.id,
          description: `Repair advance still held: ₹${(outstandingPaise / 100).toLocaleString('en-IN')}`,
          metadata: { kind: 'repair_advance_outstanding', repairAdvanceId: advance.id },
        },
        tx,
      );
    }

    await tx
      .update(acRepairAdvances)
      .set({
        actualCostPaise,
        returnedPaise,
        outstandingPaise: Math.max(0, outstandingPaise),
        status: 'settled',
        settlementActivityId: activity.id,
        updatedAt: new Date(),
      })
      .where(eq(acRepairAdvances.id, advance.id));


    await logActivity(
      {
        action: 'repair_advance_settled',
        entityType: 'asset',
        entityId: input.assetId,
        afterState: {
          advanceId: advance.id,
          actualCostPaise,
          returnedPaise,
          outstandingPaise,
        },
      },
      tx,
    );

    await recalculateAsset(input.assetId, tx);
    return activity;
  });
}

/** Helper for forms that pass rupees */
export function activityAmountFromRupees(rupees: number | undefined): number | null {
  if (rupees == null || !Number.isFinite(rupees)) return null;
  return rupeesToPaise(rupees);
}
