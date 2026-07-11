import { sql, type SQL } from 'drizzle-orm';
import { acAssets } from '@/src/capital/db/schema';
import type { CapitalDbClient } from '@/src/capital/lib/db/types';
import { capitalDb } from '@/src/capital/db/client';
import { eq } from 'drizzle-orm';

/** Statuses that still accept new costs (expenses / repairs). */
export const ACTIVE_INVESTMENT_STATUSES = [
  'purchased',
  'repairing',
  'painting',
  'ready',
  'listed',
] as const;

/** Sold or fully closed — no new expenses. */
export const EXPENSE_BLOCKED_STATUSES = ['sold', 'settled', 'cancelled'] as const;

/** Fully closed — no payments or cost mutations. Sold still allows capital/profit receipts. */
export const PAYMENT_BLOCKED_STATUSES = ['settled', 'cancelled'] as const;

export type AssetStatus = (typeof acAssets.$inferSelect)['status'];

export function isActiveInvestmentStatus(status: string): boolean {
  return (ACTIVE_INVESTMENT_STATUSES as readonly string[]).includes(status);
}

export function isExpenseBlockedStatus(status: string): boolean {
  return (EXPENSE_BLOCKED_STATUSES as readonly string[]).includes(status);
}

export function isPaymentBlockedStatus(status: string): boolean {
  return (PAYMENT_BLOCKED_STATUSES as readonly string[]).includes(status);
}

/** SQL: asset is still an open investment (not sold/settled/cancelled). */
export function activeInvestmentSql(column = acAssets.status): SQL {
  return sql`${column} NOT IN ('sold', 'settled', 'cancelled')`;
}

/** SQL: asset can still receive capital/profit payments (not settled/cancelled). */
export function paymentEligibleSql(column = acAssets.status): SQL {
  return sql`${column} NOT IN ('settled', 'cancelled')`;
}

export async function assertAssetAcceptsExpenses(
  assetId: string,
  db: CapitalDbClient = capitalDb,
) {
  const [asset] = await db.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
  if (!asset) throw new Error('Asset not found');
  if (isExpenseBlockedStatus(asset.status)) {
    const label = asset.status === 'sold' ? 'sold' : asset.status;
    throw new Error(
      label === 'sold'
        ? 'Cannot add expenses to a sold vehicle.'
        : `Cannot add expenses to a ${label} vehicle.`,
    );
  }
  return asset;
}

export async function assertAssetAcceptsPayments(
  assetId: string,
  db: CapitalDbClient = capitalDb,
) {
  const [asset] = await db.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
  if (!asset) throw new Error('Asset not found');
  if (isPaymentBlockedStatus(asset.status)) {
    throw new Error(`Cannot record payments on a ${asset.status} vehicle.`);
  }
  return asset;
}
