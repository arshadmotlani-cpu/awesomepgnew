import { and, asc, desc, eq } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import {
  acAssets,
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
import { postLedgerEntry, reverseSourceLedger } from './ledger';
import { logActivity } from './activity';
import { assertAssetMutable, recalculateAsset } from './assets';
import { assertAssetAcceptsExpenses } from '@/src/capital/lib/assetLifecycle';
import { autoStatusOnActivity } from '@/src/capital/lib/vehicleLifecycle';

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

    const [assetRow] = await tx
      .select({ status: acAssets.status })
      .from(acAssets)
      .where(eq(acAssets.id, input.assetId))
      .limit(1);
    const nextStatus = autoStatusOnActivity(assetRow?.status ?? '', 'repair_advance');
    if (nextStatus && assetRow && assetRow.status !== nextStatus) {
      await tx
        .update(acAssets)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(acAssets.id, input.assetId));
      await logActivity(
        {
          action: 'asset_status_changed',
          entityType: 'asset',
          entityId: input.assetId,
          beforeState: { status: assetRow.status },
          afterState: { status: nextStatus, reason: 'auto:repair_advance' },
        },
        tx,
      );
    }

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
          additionalAmountRequiredPaise: Math.max(0, -outstandingPaise),
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

/** Reverse a purchase activity (ledger-safe) and recalc TVI. */
export async function reverseVehicleActivity(activityId: string, reason: string) {
  return capitalDb.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(acVehicleActivities)
      .where(and(eq(acVehicleActivities.id, activityId), eq(acVehicleActivities.isReversed, false)))
      .limit(1);
    if (!row) throw new Error('Activity not found or already reversed');
    if (row.activityType === 'vehicle_created') {
      throw new Error('Cannot reverse vehicle creation');
    }
    if (row.activityType === 'sale') {
      throw new Error('Cannot reverse sale via activities — use sale workflow');
    }

    await assertAssetMutable(row.assetId, tx);

    if (row.activityType === 'repair_advance') {
      const [advance] = await tx
        .select()
        .from(acRepairAdvances)
        .where(eq(acRepairAdvances.advanceActivityId, row.id))
        .limit(1);
      if (advance && advance.status === 'settled') {
        throw new Error('Reverse the repair settlement before reversing this advance');
      }
      if (advance) {
        await tx.delete(acRepairAdvances).where(eq(acRepairAdvances.id, advance.id));
      }
    }

    if (row.activityType === 'repair_settlement' && row.repairAdvanceId) {
      const [advance] = await tx
        .select()
        .from(acRepairAdvances)
        .where(eq(acRepairAdvances.id, row.repairAdvanceId))
        .limit(1);
      if (advance) {
        await tx
          .update(acRepairAdvances)
          .set({
            status: 'open',
            actualCostPaise: null,
            returnedPaise: 0,
            outstandingPaise: advance.advancePaise,
            settlementActivityId: null,
            updatedAt: new Date(),
          })
          .where(eq(acRepairAdvances.id, advance.id));
      }
    }

    await tx
      .update(acVehicleActivities)
      .set({ isReversed: true, updatedAt: new Date() })
      .where(eq(acVehicleActivities.id, activityId));

    await reverseSourceLedger(
      'ac_vehicle_activities',
      activityId,
      `Reversal: ${reason}`,
      tx,
    );

    await recalculateAsset(row.assetId, tx);
    await logActivity(
      {
        action: 'vehicle_activity_reversed',
        entityType: 'asset',
        entityId: row.assetId,
        afterState: { activityId, reason, activityType: row.activityType },
      },
      tx,
    );
  });
}

export type UpdateVehicleActivityInput = {
  activityId: string;
  activityAt?: string;
  amountPaise?: number | null;
  title?: string;
  notes?: string;
  /** Repair settlement amendments */
  actualCostPaise?: number;
  returnedPaise?: number;
};

/** Edit activity in place; re-posts ledger when amount changes. */
export async function updateVehicleActivity(input: UpdateVehicleActivityInput) {
  return capitalDb.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(acVehicleActivities)
      .where(
        and(eq(acVehicleActivities.id, input.activityId), eq(acVehicleActivities.isReversed, false)),
      )
      .limit(1);
    if (!row) throw new Error('Activity not found or already reversed');
    if (row.activityType === 'vehicle_created' || row.activityType === 'sale') {
      throw new Error('This activity cannot be edited');
    }
    await assertAssetMutable(row.assetId, tx);

    const meta = VEHICLE_ACTIVITY_TYPE_META[row.activityType];

    if (row.activityType === 'repair_settlement') {
      if (input.actualCostPaise == null) throw new Error('Actual repair cost is required');
      const returnedPaise = Math.round(input.returnedPaise ?? 0);
      const actualCostPaise = Math.round(input.actualCostPaise);
      if (!row.repairAdvanceId) throw new Error('Settlement is missing its advance link');
      const [advance] = await tx
        .select()
        .from(acRepairAdvances)
        .where(eq(acRepairAdvances.id, row.repairAdvanceId))
        .limit(1);
      if (!advance) throw new Error('Repair advance not found');

      const settlement = computeRepairSettlement({
        advancePaise: advance.advancePaise,
        actualCostPaise,
        returnedPaise,
      });

      await reverseSourceLedger(
        'ac_vehicle_activities',
        row.id,
        'Edit repair settlement — clear prior ledger',
        tx,
      );

      // Re-post clear + cost (+ still held) like create path
      await postLedgerEntry(
        {
          entryType: 'adjustment',
          direction: 'credit',
          amountPaise: advance.advancePaise,
          assetId: row.assetId,
          sourceTable: 'ac_vehicle_activities',
          sourceId: row.id,
          description: `Clear repair advance float: ₹${(advance.advancePaise / 100).toLocaleString('en-IN')}`,
          metadata: { kind: 'repair_advance_clear', repairAdvanceId: advance.id },
        },
        tx,
      );
      if (actualCostPaise > 0) {
        await postLedgerEntry(
          {
            entryType: 'expense',
            direction: 'debit',
            amountPaise: actualCostPaise,
            assetId: row.assetId,
            sourceTable: 'ac_vehicle_activities',
            sourceId: row.id,
            description: `Repair actual cost: ₹${(actualCostPaise / 100).toLocaleString('en-IN')}`,
            metadata: { kind: 'repair_settlement_cost', repairAdvanceId: advance.id },
          },
          tx,
        );
      }
      if (settlement.outstandingPaise > 0) {
        await postLedgerEntry(
          {
            entryType: 'adjustment',
            direction: 'debit',
            amountPaise: settlement.outstandingPaise,
            assetId: row.assetId,
            sourceTable: 'ac_vehicle_activities',
            sourceId: row.id,
            description: `Repair advance still held: ₹${(settlement.outstandingPaise / 100).toLocaleString('en-IN')}`,
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
          outstandingPaise: Math.max(0, settlement.outstandingPaise),
          status: 'settled',
          updatedAt: new Date(),
        })
        .where(eq(acRepairAdvances.id, advance.id));

      await tx
        .update(acVehicleActivities)
        .set({
          activityAt: input.activityAt ?? row.activityAt,
          amountPaise: actualCostPaise,
          title: input.title?.trim() || row.title,
          notes: input.notes ?? row.notes,
          metadata: {
            ...(typeof row.metadata === 'object' && row.metadata ? row.metadata : {}),
            repairAdvanceId: advance.id,
            advancePaise: advance.advancePaise,
            actualCostPaise,
            returnedPaise,
            outstandingPaise: settlement.outstandingPaise,
            additionalAmountRequiredPaise: settlement.additionalAmountRequiredPaise,
          },
          updatedAt: new Date(),
        })
        .where(eq(acVehicleActivities.id, row.id));

      await recalculateAsset(row.assetId, tx);
      return;
    }

    if (row.activityType === 'repair_advance') {
      const nextAmount =
        input.amountPaise !== undefined
          ? input.amountPaise == null
            ? null
            : Math.round(input.amountPaise)
          : row.amountPaise;
      if (nextAmount == null || nextAmount <= 0) {
        throw new Error('Repair advance amount must be positive');
      }

      const [advance] = await tx
        .select()
        .from(acRepairAdvances)
        .where(eq(acRepairAdvances.advanceActivityId, row.id))
        .limit(1);
      if (!advance) throw new Error('Repair advance record not found');
      if (advance.status === 'settled') {
        throw new Error('Cannot edit a settled repair advance — edit the settlement instead');
      }

      await reverseSourceLedger(
        'ac_vehicle_activities',
        row.id,
        'Edit repair advance — clear prior ledger',
        tx,
      );
      const entry = await postLedgerEntry(
        {
          entryType: 'adjustment',
          direction: 'debit',
          amountPaise: nextAmount,
          assetId: row.assetId,
          sourceTable: 'ac_vehicle_activities',
          sourceId: row.id,
          description: `Repair advance: ₹${(nextAmount / 100).toLocaleString('en-IN')}`,
          metadata: { kind: 'repair_advance', repairAdvanceId: advance.id },
        },
        tx,
      );

      await tx
        .update(acRepairAdvances)
        .set({
          advancePaise: nextAmount,
          outstandingPaise: nextAmount,
          notes: input.notes ?? advance.notes,
          updatedAt: new Date(),
        })
        .where(eq(acRepairAdvances.id, advance.id));

      await tx
        .update(acVehicleActivities)
        .set({
          activityAt: input.activityAt ?? row.activityAt,
          amountPaise: nextAmount,
          title: input.title?.trim() || row.title,
          notes: input.notes ?? row.notes,
          ledgerEntryId: entry.id,
          updatedAt: new Date(),
        })
        .where(eq(acVehicleActivities.id, row.id));

      await recalculateAsset(row.assetId, tx);
      return;
    }

    const nextAmount =
      input.amountPaise !== undefined
        ? input.amountPaise == null
          ? null
          : Math.round(input.amountPaise)
        : row.amountPaise;

    if (meta.requiresAmount && (nextAmount == null || nextAmount === 0)) {
      throw new Error('Amount is required for this activity');
    }

    const amountChanged = nextAmount !== row.amountPaise;
    if (amountChanged) {
      await reverseSourceLedger(
        'ac_vehicle_activities',
        row.id,
        'Edit activity — clear prior ledger',
        tx,
      );
      if (nextAmount != null && nextAmount !== 0 && meta.ledgerDirection) {
        const abs = Math.abs(nextAmount);
        const direction =
          nextAmount < 0
            ? meta.ledgerDirection === 'debit'
              ? 'credit'
              : 'debit'
            : meta.ledgerDirection;
        const entry = await postLedgerEntry(
          {
            entryType: meta.costImpact === 'vehicle_cost' ? 'expense' : 'adjustment',
            direction,
            amountPaise: abs,
            assetId: row.assetId,
            sourceTable: 'ac_vehicle_activities',
            sourceId: row.id,
            description: `${meta.label}: ${input.title?.trim() || row.title || meta.label}`,
          },
          tx,
        );
        await tx
          .update(acVehicleActivities)
          .set({ ledgerEntryId: entry.id })
          .where(eq(acVehicleActivities.id, row.id));
      }
    }

    await tx
      .update(acVehicleActivities)
      .set({
        activityAt: input.activityAt ?? row.activityAt,
        amountPaise: nextAmount,
        title: input.title?.trim() || row.title,
        notes: input.notes ?? row.notes,
        updatedAt: new Date(),
      })
      .where(eq(acVehicleActivities.id, row.id));

    await recalculateAsset(row.assetId, tx);
    await logActivity(
      {
        action: 'vehicle_activity_updated',
        entityType: 'asset',
        entityId: row.assetId,
        afterState: {
          activityId: row.id,
          activityType: row.activityType,
          amountPaise: nextAmount,
        },
      },
      tx,
    );
  });
}

/** Helper for forms that pass rupees */
export function activityAmountFromRupees(rupees: number | undefined): number | null {
  if (rupees == null || !Number.isFinite(rupees)) return null;
  return rupeesToPaise(rupees);
}
