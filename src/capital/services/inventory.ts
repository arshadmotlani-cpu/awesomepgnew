/**
 * Inventory SSOT — Dealership Operating System.
 *
 * Inventory = every vehicle that is still open (not sold, not settled, not archived).
 * This is a fleet/count concept. It must NEVER be derived from Me stakes, funding gap,
 * Active Capital, or capital allocation.
 *
 * Consumers: Vehicles page (In Stock), Dashboard "Vehicles in Stock", Ready to list
 * (subset: status = ready), Reports inventory counts.
 */

import { and, count, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import { acAssets } from '@/src/capital/db/schema';
import type { CapitalDbClient } from '@/src/capital/lib/db/types';
import {
  ACTIVE_INVESTMENT_STATUSES,
  activeInvestmentSql,
  isActiveInvestmentStatus,
} from '@/src/capital/lib/assetLifecycle';

/** Closed / out of inventory. */
export const CLOSED_INVENTORY_STATUSES = ['sold', 'settled', 'cancelled'] as const;

/** Open inventory statuses (purchased → listed). Alias of ACTIVE_INVESTMENT_STATUSES. */
export const OPEN_INVENTORY_STATUSES = ACTIVE_INVESTMENT_STATUSES;

/** Attention bucket: ready to list / ready for sale. */
export const READY_TO_LIST_STATUS = 'ready' as const;

export type OpenInventoryStatus = (typeof OPEN_INVENTORY_STATUSES)[number];

export type InventoryVehicleRow = {
  id: string;
  displayName: string;
  status: string;
  purchaseDate: string;
  purchasePricePaise: number;
};

/** Pure predicate — single definition of "in inventory". */
export function isOpenInventoryStatus(status: string): boolean {
  return isActiveInvestmentStatus(status);
}

export function isReadyToListStatus(status: string): boolean {
  return status === READY_TO_LIST_STATUS;
}

/** SQL predicate shared by every inventory query. */
export function openInventorySql(column = acAssets.status): SQL {
  return activeInvestmentSql(column);
}

export function soldInventorySql(column = acAssets.status): SQL {
  return inArray(column, ['sold', 'settled'] as Array<(typeof acAssets.status.enumValues)[number]>);
}

export function readyToListSql(column = acAssets.status): SQL {
  return eq(column, READY_TO_LIST_STATUS);
}

/** Count of open inventory vehicles. */
export async function countOpenInventory(
  db: CapitalDbClient = capitalDb,
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(acAssets)
    .where(openInventorySql());
  return Number(row?.c ?? 0);
}

/** List open inventory vehicles (newest first). */
export async function listOpenInventory(
  opts?: { limit?: number; statuses?: readonly string[] },
  db: CapitalDbClient = capitalDb,
): Promise<InventoryVehicleRow[]> {
  const statusFilter =
    opts?.statuses && opts.statuses.length > 0
      ? inArray(
          acAssets.status,
          opts.statuses as Array<(typeof acAssets.status.enumValues)[number]>,
        )
      : openInventorySql();

  // When a status subset is requested, still require it to be open inventory.
  const where =
    opts?.statuses && opts.statuses.length > 0
      ? and(openInventorySql(), statusFilter)
      : statusFilter;

  const q = db
    .select({
      id: acAssets.id,
      displayName: acAssets.displayName,
      status: acAssets.status,
      purchaseDate: acAssets.purchaseDate,
      purchasePricePaise: acAssets.purchasePricePaise,
    })
    .from(acAssets)
    .where(where)
    .orderBy(desc(acAssets.updatedAt));

  const rows = opts?.limit != null ? await q.limit(opts.limit) : await q;
  return rows;
}

export async function countReadyToList(db: CapitalDbClient = capitalDb): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(acAssets)
    .where(and(openInventorySql(), readyToListSql()));
  return Number(row?.c ?? 0);
}

export async function listReadyToList(
  opts?: { limit?: number },
  db: CapitalDbClient = capitalDb,
): Promise<InventoryVehicleRow[]> {
  return listOpenInventory(
    { limit: opts?.limit, statuses: [READY_TO_LIST_STATUS] },
    db,
  );
}

/**
 * Snapshot used by dashboard + consistency checks.
 * openCount is the SSOT for Vehicles in Stock / Vehicles page In Stock.
 */
export async function getInventorySnapshot(db: CapitalDbClient = capitalDb): Promise<{
  openCount: number;
  readyCount: number;
  openVehicles: InventoryVehicleRow[];
  readyVehicles: InventoryVehicleRow[];
  byStatus: Record<string, number>;
}> {
  const [openVehicles, statusRows] = await Promise.all([
    listOpenInventory(undefined, db),
    db
      .select({ status: acAssets.status, c: count() })
      .from(acAssets)
      .where(openInventorySql())
      .groupBy(acAssets.status),
  ]);

  const byStatus: Record<string, number> = {};
  for (const r of statusRows) {
    byStatus[r.status] = Number(r.c ?? 0);
  }
  const readyVehicles = openVehicles.filter((v) => isReadyToListStatus(v.status));

  return {
    openCount: openVehicles.length,
    readyCount: readyVehicles.length,
    openVehicles,
    readyVehicles,
    byStatus,
  };
}

/**
 * Consistency guard for tests / diagnostics.
 * Ready-to-list may be a subset; when every open vehicle is ready, counts must match.
 */
export function assertInventoryCountsConsistent(input: {
  vehiclesPageOpenCount: number;
  dashboardVehiclesInStock: number;
  readyToListCount: number;
  allOpenAreReady: boolean;
}): void {
  if (input.vehiclesPageOpenCount !== input.dashboardVehiclesInStock) {
    throw new Error(
      `Inventory mismatch: Vehicles page (${input.vehiclesPageOpenCount}) ≠ Vehicles in Stock KPI (${input.dashboardVehiclesInStock})`,
    );
  }
  if (input.allOpenAreReady && input.readyToListCount !== input.vehiclesPageOpenCount) {
    throw new Error(
      `Inventory mismatch: Ready to list (${input.readyToListCount}) ≠ open inventory (${input.vehiclesPageOpenCount}) when all open vehicles are ready`,
    );
  }
}

/** Pure helper for unit tests — same rules as SQL without a database. */
export function selectOpenInventoryFromRows<T extends { status: string }>(rows: T[]): T[] {
  return rows.filter((r) => isOpenInventoryStatus(r.status));
}

export function selectReadyToListFromRows<T extends { status: string }>(rows: T[]): T[] {
  return selectOpenInventoryFromRows(rows).filter((r) => isReadyToListStatus(r.status));
}
