import { and, eq, sum } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import {
  acVehicleAdditionalIncome,
  VEHICLE_ADDITIONAL_INCOME_TYPE_LABELS,
  VEHICLE_ADDITIONAL_INCOME_TYPES,
  type VehicleAdditionalIncomeType,
} from '@/src/capital/db/schema';
import type { CapitalDbClient } from '@/src/capital/lib/db/types';
import { sumAdditionalIncome } from '@/src/capital/lib/investmentMath';

export { VEHICLE_ADDITIONAL_INCOME_TYPE_LABELS, VEHICLE_ADDITIONAL_INCOME_TYPES };

export function isVehicleAdditionalIncomeType(
  value: string,
): value is VehicleAdditionalIncomeType {
  return (VEHICLE_ADDITIONAL_INCOME_TYPES as readonly string[]).includes(value);
}

export async function listAdditionalIncome(assetId: string, db: CapitalDbClient = capitalDb) {
  return db
    .select()
    .from(acVehicleAdditionalIncome)
    .where(
      and(
        eq(acVehicleAdditionalIncome.assetId, assetId),
        eq(acVehicleAdditionalIncome.isReversed, false),
      ),
    );
}

export async function sumAdditionalIncomeForAsset(
  assetId: string,
  db: CapitalDbClient = capitalDb,
): Promise<number> {
  const [row] = await db
    .select({ total: sum(acVehicleAdditionalIncome.amountPaise) })
    .from(acVehicleAdditionalIncome)
    .where(
      and(
        eq(acVehicleAdditionalIncome.assetId, assetId),
        eq(acVehicleAdditionalIncome.isReversed, false),
      ),
    );
  return Math.max(0, Math.round(Number(row?.total ?? 0)));
}

export async function createAdditionalIncome(
  input: {
    assetId: string;
    incomeType: VehicleAdditionalIncomeType;
    amountPaise: number;
    occurredAt: string;
    notes?: string | null;
  },
  db: CapitalDbClient = capitalDb,
) {
  const amountPaise = Math.round(input.amountPaise);
  if (amountPaise <= 0) throw new Error('Amount must be greater than zero');
  if (!isVehicleAdditionalIncomeType(input.incomeType)) {
    throw new Error('Invalid income type');
  }

  const [row] = await db
    .insert(acVehicleAdditionalIncome)
    .values({
      assetId: input.assetId,
      incomeType: input.incomeType,
      amountPaise,
      occurredAt: input.occurredAt,
      notes: input.notes?.trim() || null,
    })
    .returning();

  return row;
}

export async function updateAdditionalIncome(
  input: {
    id: string;
    incomeType: VehicleAdditionalIncomeType;
    amountPaise: number;
    occurredAt: string;
    notes?: string | null;
  },
  db: CapitalDbClient = capitalDb,
) {
  const amountPaise = Math.round(input.amountPaise);
  if (amountPaise <= 0) throw new Error('Amount must be greater than zero');
  if (!isVehicleAdditionalIncomeType(input.incomeType)) {
    throw new Error('Invalid income type');
  }

  const [row] = await db
    .update(acVehicleAdditionalIncome)
    .set({
      incomeType: input.incomeType,
      amountPaise,
      occurredAt: input.occurredAt,
      notes: input.notes?.trim() || null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(acVehicleAdditionalIncome.id, input.id),
        eq(acVehicleAdditionalIncome.isReversed, false),
      ),
    )
    .returning();

  if (!row) throw new Error('Income entry not found');
  return row;
}

export async function reverseAdditionalIncome(
  incomeId: string,
  db: CapitalDbClient = capitalDb,
) {
  await db
    .update(acVehicleAdditionalIncome)
    .set({ isReversed: true, updatedAt: new Date() })
    .where(eq(acVehicleAdditionalIncome.id, incomeId));
}

export { sumAdditionalIncome };
