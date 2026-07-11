import { and, asc, count, desc, eq, ilike, or, sql, sum, type SQL } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import {
  acActivityLog,
  acAssets,
  acAutomotiveDetails,
  acDocuments,
  acExpenses,
  acLedgerEntries,
  acPaymentsReceived,
} from '@/src/capital/db/schema';
import {
  calcHoldingDays,
  calcRoiBps,
  calcSettlementPctBps,
  normalizeRegistration,
} from '@/src/capital/lib/money';
import { computeProfitShare } from '@/src/capital/lib/profitShare';
import {
  activeInvestmentSql,
  paymentEligibleSql,
} from '@/src/capital/lib/assetLifecycle';
import type { AssetListQuery } from '@/src/capital/lib/validation/schemas';
import type { CapitalDbClient } from '@/src/capital/lib/db/types';
import { postLedgerEntry } from './ledger';
import { logActivity } from './activity';

const TERMINAL_STATUSES = new Set(['cancelled', 'settled']);

export type CreateAssetInput = {
  manufacturer: string;
  model: string;
  year: number;
  fuelType: 'petrol' | 'diesel' | 'cng' | 'ev' | 'hybrid';
  ownership: 'first_owner' | 'second_owner' | 'third_owner';
  purchaseDate: string;
  purchasePricePaise: number;
  notes?: string;
  /** Optional — not collected on the new-asset form; used for historical imports */
  registrationNumber?: string;
  variant?: string;
  color?: string;
};

export async function recalculateAsset(assetId: string, db: CapitalDbClient = capitalDb) {
  const [expenseSum] = await db
    .select({ total: sum(acExpenses.amountPaise) })
    .from(acExpenses)
    .where(and(eq(acExpenses.assetId, assetId), eq(acExpenses.isReversed, false)));

  const [paymentSums] = await db
    .select({
      capital: sum(acPaymentsReceived.capitalReturnedPaise),
      profit: sum(acPaymentsReceived.profitPaise),
      refunds: sql<number>`COALESCE(SUM(CASE WHEN ${acPaymentsReceived.paymentType} = 'refund' THEN ${acPaymentsReceived.amountPaise} ELSE 0 END), 0)`,
    })
    .from(acPaymentsReceived)
    .where(and(eq(acPaymentsReceived.assetId, assetId), eq(acPaymentsReceived.isReversed, false)));

  const [asset] = await db.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
  if (!asset) return;

  const totalExpense = Number(expenseSum?.total ?? 0);
  const totalInvestment = asset.purchasePricePaise + totalExpense;
  const capitalReturned = Number(paymentSums?.capital ?? 0);
  const profitReceived = Number(paymentSums?.profit ?? 0);
  const refundPaise = Number(paymentSums?.refunds ?? 0);
  const recoveredPaise = capitalReturned + profitReceived;
  const profitPaise =
    asset.actualSalePricePaise != null ? asset.actualSalePricePaise - totalInvestment : null;
  const holdingDays = calcHoldingDays(asset.purchaseDate, asset.saleDate);
  const roiBps = profitPaise != null ? calcRoiBps(profitPaise, totalInvestment) : null;
  const settlementPctBps = calcSettlementPctBps(recoveredPaise, totalInvestment);
  const outstandingPaise = totalInvestment - capitalReturned + refundPaise;

  if (capitalReturned > totalInvestment) {
    throw new Error(
      `Capital returned (₹${capitalReturned / 100}) exceeds investment (₹${totalInvestment / 100}) for asset ${assetId}`,
    );
  }

  if (profitPaise != null && profitReceived > Math.max(0, asset.mySharePaise ?? profitPaise)) {
    throw new Error(
      `Profit received exceeds your share of profit for asset ${assetId}`,
    );
  }

  // Preserve share fields; refresh business/my ROI if share already set
  const shareUpdate =
    profitPaise != null && asset.mySharePaise != null
      ? {
          businessRoiBps: calcRoiBps(profitPaise, totalInvestment),
          myRoiBps: calcRoiBps(asset.mySharePaise, totalInvestment),
        }
      : {};

  await db
    .update(acAssets)
    .set({
      totalExpensePaise: totalExpense,
      totalInvestmentPaise: totalInvestment,
      holdingDays,
      profitPaise,
      roiBps,
      capitalReturnedPaise: capitalReturned,
      profitReceivedPaise: profitReceived,
      outstandingPaise: Math.max(0, outstandingPaise),
      settlementPctBps,
      updatedAt: new Date(),
      ...shareUpdate,
    })
    .where(eq(acAssets.id, assetId));
}

export async function assertAssetMutable(assetId: string, db: CapitalDbClient = capitalDb) {
  const [asset] = await db.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
  if (!asset) throw new Error('Asset not found');
  if (asset.status === 'settled' || asset.status === 'cancelled') {
    throw new Error(`Cannot modify a ${asset.status} asset`);
  }
  return asset;
}

export async function createAsset(input: CreateAssetInput) {
  const displayName = `${input.year} ${input.manufacturer} ${input.model}`;

  return capitalDb.transaction(async (tx) => {
    const [asset] = await tx
      .insert(acAssets)
      .values({
        displayName,
        purchaseDate: input.purchaseDate,
        purchasePricePaise: input.purchasePricePaise,
        totalInvestmentPaise: input.purchasePricePaise,
        outstandingPaise: input.purchasePricePaise,
        notes: input.notes,
        holdingDays: calcHoldingDays(input.purchaseDate),
      })
      .returning();

    await tx.insert(acAutomotiveDetails).values({
      assetId: asset.id,
      manufacturer: input.manufacturer,
      model: input.model,
      variant: input.variant,
      year: input.year,
      fuelType: input.fuelType,
      ownership: input.ownership,
      color: input.color,
      registrationNumber: input.registrationNumber
        ? normalizeRegistration(input.registrationNumber)
        : null,
    });

    await postLedgerEntry(
      {
        entryType: 'asset_purchase',
        direction: 'debit',
        amountPaise: input.purchasePricePaise,
        assetId: asset.id,
        sourceTable: 'ac_assets',
        sourceId: asset.id,
        description: `Asset purchase: ${displayName}`,
      },
      tx,
    );

    await logActivity(
      {
        action: 'asset_created',
        entityType: 'asset',
        entityId: asset.id,
        afterState: {
          displayName,
          manufacturer: input.manufacturer,
          model: input.model,
          fuelType: input.fuelType,
          ownership: input.ownership,
        },
      },
      tx,
    );

    return asset;
  });
}

export async function updateAssetStatus(assetId: string, status: string) {
  if (TERMINAL_STATUSES.has(status)) {
    throw new Error(`Use the dedicated workflow to mark an asset as ${status}`);
  }

  const [before] = await capitalDb.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
  if (!before) throw new Error('Asset not found');
  if (TERMINAL_STATUSES.has(before.status)) {
    throw new Error(`Cannot change status of a ${before.status} asset`);
  }

  await capitalDb
    .update(acAssets)
    .set({ status: status as typeof acAssets.$inferInsert.status, updatedAt: new Date() })
    .where(eq(acAssets.id, assetId));

  await logActivity({
    action: 'asset_status_changed',
    entityType: 'asset',
    entityId: assetId,
    beforeState: { status: before.status },
    afterState: { status },
  });
}

export async function recordSale(
  assetId: string,
  actualSalePricePaise: number,
  saleDate: string,
  share?: {
    mode: 'percentage' | 'fixed';
    partnerPct?: number;
    myPct?: number;
    partnerFixedPaise?: number;
    myFixedPaise?: number;
  },
) {
  await assertAssetMutable(assetId);

  // Recalc expenses first so share uses current investment
  await recalculateAsset(assetId);
  const [fresh] = await capitalDb.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
  if (!fresh) throw new Error('Asset not found');

  const totalInvestment = fresh.totalInvestmentPaise;
  const grossProfit = actualSalePricePaise - totalInvestment;
  const shareResult = computeProfitShare(
    {
      grossPaise: grossProfit,
      mode: share?.mode ?? 'percentage',
      partnerPct: share?.partnerPct ?? 0,
      myPct: share?.myPct ?? 100,
      partnerFixedPaise: share?.partnerFixedPaise,
      myFixedPaise: share?.myFixedPaise,
    },
    totalInvestment,
  );

  await capitalDb
    .update(acAssets)
    .set({
      actualSalePricePaise,
      saleDate,
      status: 'sold',
      profitShareMode: shareResult.mode,
      partnerSharePctBps: shareResult.partnerSharePctBps,
      mySharePctBps: shareResult.mySharePctBps,
      partnerSharePaise: shareResult.partnerSharePaise,
      mySharePaise: shareResult.mySharePaise,
      businessRoiBps: shareResult.businessRoiBps,
      myRoiBps: shareResult.myRoiBps,
      updatedAt: new Date(),
    })
    .where(eq(acAssets.id, assetId));

  await recalculateAsset(assetId);
  await logActivity({
    action: 'asset_updated',
    entityType: 'asset',
    entityId: assetId,
    afterState: {
      actualSalePricePaise,
      saleDate,
      status: 'sold',
      grossProfitPaise: shareResult.grossPaise,
      partnerSharePaise: shareResult.partnerSharePaise,
      mySharePaise: shareResult.mySharePaise,
    },
  });
}

export async function listAssets(opts?: {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  /** Only open investments (excludes sold/settled/cancelled) */
  activeOnly?: boolean;
  /** Open investments + sold (for payments awaiting settlement) */
  paymentEligibleOnly?: boolean;
}) {
  const result = await listAssetsQuery({
    page: opts?.page ?? 1,
    pageSize: opts?.pageSize ?? 200,
    status: opts?.status,
    search: opts?.search,
    sort: 'created',
    order: 'desc',
    profitFilter: 'all',
    activeOnly: opts?.activeOnly,
    paymentEligibleOnly: opts?.paymentEligibleOnly,
  });
  return result.rows;
}

export async function listAssetsQuery(query: AssetListQuery) {
  const conditions: SQL[] = [];

  if (query.status) {
    conditions.push(eq(acAssets.status, query.status as typeof acAssets.$inferSelect.status));
  }
  if (query.manufacturer) {
    conditions.push(ilike(acAutomotiveDetails.manufacturer, `%${query.manufacturer}%`));
  }
  if (query.search) {
    const term = `%${query.search}%`;
    const searchCond = or(
      ilike(acAutomotiveDetails.registrationNumber, term),
      ilike(acAssets.displayName, term),
      ilike(acAutomotiveDetails.manufacturer, term),
      ilike(acAutomotiveDetails.model, term),
    );
    if (searchCond) conditions.push(searchCond);
  }
  if (query.profitFilter === 'profit') {
    conditions.push(sql`${acAssets.profitPaise} > 0`);
  }
  if (query.profitFilter === 'loss') {
    conditions.push(sql`${acAssets.profitPaise} < 0`);
  }
  if (query.activeOnly) {
    conditions.push(activeInvestmentSql());
  } else if (query.paymentEligibleOnly) {
    conditions.push(paymentEligibleSql());
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = {
    created: acAssets.createdAt,
    purchase: acAssets.purchaseDate,
    investment: acAssets.totalInvestmentPaise,
    profit: acAssets.profitPaise,
    holding: acAssets.holdingDays,
  }[query.sort];

  const orderBy = query.order === 'asc' ? asc(sortColumn) : desc(sortColumn);
  const offset = (query.page - 1) * query.pageSize;

  const [countRow] = await capitalDb
    .select({ c: count() })
    .from(acAssets)
    .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
    .where(where);

  const rows = await capitalDb
    .select({ asset: acAssets, auto: acAutomotiveDetails })
    .from(acAssets)
    .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
    .where(where)
    .orderBy(orderBy)
    .limit(query.pageSize)
    .offset(offset);

  return {
    rows,
    total: Number(countRow?.c ?? 0),
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(Number(countRow?.c ?? 0) / query.pageSize),
  };
}

export async function listManufacturers() {
  const rows = await capitalDb
    .selectDistinct({ manufacturer: acAutomotiveDetails.manufacturer })
    .from(acAutomotiveDetails)
    .orderBy(asc(acAutomotiveDetails.manufacturer));
  return rows.map((r) => r.manufacturer);
}

export async function getAssetTimeline(assetId: string) {
  const [activities, ledger, expenses, payments, documents] = await Promise.all([
    capitalDb
      .select()
      .from(acActivityLog)
      .where(eq(acActivityLog.entityId, assetId))
      .orderBy(desc(acActivityLog.createdAt))
      .limit(50),
    capitalDb
      .select()
      .from(acLedgerEntries)
      .where(eq(acLedgerEntries.assetId, assetId))
      .orderBy(desc(acLedgerEntries.createdAt))
      .limit(50),
    capitalDb
      .select()
      .from(acExpenses)
      .where(and(eq(acExpenses.assetId, assetId), eq(acExpenses.isReversed, false)))
      .orderBy(desc(acExpenses.expenseDate)),
    capitalDb
      .select()
      .from(acPaymentsReceived)
      .where(and(eq(acPaymentsReceived.assetId, assetId), eq(acPaymentsReceived.isReversed, false)))
      .orderBy(desc(acPaymentsReceived.receivedAt)),
    capitalDb.select().from(acDocuments).where(eq(acDocuments.assetId, assetId)),
  ]);

  return { activities, ledger, expenses, payments, documents };
}

export async function getAssetDetail(assetId: string) {
  const [row] = await capitalDb
    .select({ asset: acAssets, auto: acAutomotiveDetails })
    .from(acAssets)
    .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
    .where(eq(acAssets.id, assetId))
    .limit(1);
  return row ?? null;
}
