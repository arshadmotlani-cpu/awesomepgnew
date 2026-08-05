import { and, asc, count, desc, eq, ilike, inArray, or, sql, sum, type SQL } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import {
  acActivityLog,
  acAssetInvestors,
  acAssets,
  acAutomotiveDetails,
  acDocuments,
  acLedgerEntries,
  acPaymentsReceived,
  acRepairAdvances,
  acVehicleActivities,
} from '@/src/capital/db/schema';
import type { InvestorSlot } from '@/src/capital/db/schema/investors';
import {
  calcHoldingDays,
  calcSettlementPctBps,
  normalizeRegistration,
} from '@/src/capital/lib/money';
import {
  fullSelfFunding,
  validateFundingStructure,
  type InvestorFundingInput,
} from '@/src/capital/lib/investors';
import {
  computeBudgetRemaining,
  computeCurrentInvestment,
  computeGrossDealProfit,
  splitDealProfit,
  sumAdditionalIncome,
  type ProfitMode,
} from '@/src/capital/lib/investmentMath';
import {
  canArchive,
  canTransition,
  isAssetLifecycleStatus,
  lifecycleLabel,
} from '@/src/capital/lib/vehicleLifecycle';
import { computeVehicleRois } from '@/src/capital/lib/roi';
import {
  activeInvestmentSql,
  paymentEligibleSql,
} from '@/src/capital/lib/assetLifecycle';
import { openInventorySql } from '@/src/capital/services/inventory';
import type { AssetListQuery } from '@/src/capital/lib/validation/schemas';
import type { CapitalDbClient } from '@/src/capital/lib/db/types';
import { logActivity } from './activity';
import { acSellerPayments, acVehicleAdditionalIncome, acVehicleCosts } from '@/src/capital/db/schema';

const TERMINAL_STATUSES = new Set(['cancelled', 'settled']);

export type CreateAssetInput = {
  manufacturer: string;
  model: string;
  year: number;
  fuelType: 'petrol' | 'diesel' | 'cng' | 'ev' | 'hybrid';
  ownership: 'first_owner' | 'second_owner' | 'third_owner';
  purchaseDate: string;
  /** Expected Total Investment — editable budget target. */
  expectedTotalInvestmentPaise: number;
  notes?: string;
  registrationNumber?: string;
  variant?: string;
  color?: string;
};

export async function listAssetInvestors(assetId: string, db: CapitalDbClient = capitalDb) {
  return db
    .select()
    .from(acAssetInvestors)
    .where(eq(acAssetInvestors.assetId, assetId))
    .orderBy(asc(acAssetInvestors.slot));
}

export async function sumMyInvestedCapitalPaise(db: CapitalDbClient = capitalDb): Promise<number> {
  const [row] = await db
    .select({ total: sum(acAssetInvestors.investedPaise) })
    .from(acAssetInvestors)
    .innerJoin(acAssets, eq(acAssetInvestors.assetId, acAssets.id))
    .where(
      and(eq(acAssetInvestors.slot, 'me'), sql`${acAssets.status} <> 'cancelled'`),
    );
  return Number(row?.total ?? 0);
}

/**
 * Active Capital = Σ Current Investment on open (unsold) vehicles.
 * Replaces Me-stake ADR-015.
 */
export async function sumActiveCapitalPaise(db: CapitalDbClient = capitalDb): Promise<number> {
  const [row] = await db
    .select({ total: sum(acAssets.currentInvestmentPaise) })
    .from(acAssets)
    .where(openInventorySql());
  return Number(row?.total ?? 0);
}

/** @deprecated Prefer sumActiveCapitalPaise — alias for older imports. */
export async function sumMyActiveInvestedCapitalPaise(
  db: CapitalDbClient = capitalDb,
): Promise<number> {
  return sumActiveCapitalPaise(db);
}

export async function recalculateAsset(assetId: string, db: CapitalDbClient = capitalDb) {
  const costRows = await db
    .select({
      amountPaise: acVehicleCosts.amountPaise,
      entryKind: acVehicleCosts.entryKind,
      costType: acVehicleCosts.costType,
    })
    .from(acVehicleCosts)
    .where(and(eq(acVehicleCosts.assetId, assetId), eq(acVehicleCosts.isReversed, false)));

  const incomeRows = await db
    .select({
      amountPaise: acVehicleAdditionalIncome.amountPaise,
    })
    .from(acVehicleAdditionalIncome)
    .where(
      and(
        eq(acVehicleAdditionalIncome.assetId, assetId),
        eq(acVehicleAdditionalIncome.isReversed, false),
      ),
    );

  const [asset] = await db.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
  if (!asset) return;

  const sellerPricePaise = Math.max(
    0,
    Math.round(asset.sellerPricePaise || asset.purchasePricePaise || 0),
  );
  const expectedPaise = Math.max(0, Math.round(asset.expectedTotalInvestmentPaise || 0));

  const inv = computeCurrentInvestment({
    sellerPricePaise,
    costs: costRows.map((r) => ({
      amountPaise: r.amountPaise,
      isRefund: r.entryKind === 'refund' || r.costType === 'refund' || r.amountPaise < 0,
    })),
  });

  const totalAdditionalIncomePaise = sumAdditionalIncome(incomeRows);

  const budgetRemainingPaise = computeBudgetRemaining(
    expectedPaise,
    inv.currentInvestmentPaise,
  );

  const profitPaise =
    asset.actualSalePricePaise != null
      ? computeGrossDealProfit(
          asset.actualSalePricePaise,
          inv.currentInvestmentPaise,
          totalAdditionalIncomePaise,
        )
      : null;

  const holdingDays = calcHoldingDays(asset.purchaseDate, asset.saleDate);

  let mySharePaise = asset.mySharePaise;
  let partnerSharePaise = asset.partnerSharePaise;
  let operatingPartnerProfitPaise = asset.operatingPartnerProfitPaise;

  if (profitPaise != null) {
    const mode = (asset.profitDistributionMode ?? 'SELF') as ProfitMode;
    const split = splitDealProfit(profitPaise, mode);
    mySharePaise = split.myProfitPaise;
    partnerSharePaise = split.partnerProfitPaise;
    operatingPartnerProfitPaise = split.partnerProfitPaise;
  }

  const roiFields =
    profitPaise != null
      ? computeVehicleRois({
          grossProfitPaise: profitPaise,
          totalVehicleCostPaise: Math.max(inv.currentInvestmentPaise, 1),
          myProfitPaise: mySharePaise ?? profitPaise,
          myInvestedPaise: Math.max(inv.currentInvestmentPaise, 1),
        })
      : { businessRoiBps: null, myRoiBps: null, roiBps: null };

  await db
    .update(acAssets)
    .set({
      purchasePricePaise: sellerPricePaise,
      sellerPricePaise,
      expectedTotalInvestmentPaise: expectedPaise,
      currentInvestmentPaise: inv.currentInvestmentPaise,
      budgetRemainingPaise,
      totalExpensePaise: inv.costsPaise - inv.refundsPaise,
      repairTotalPaise: inv.costsPaise,
      dealerRefundTotalPaise: inv.refundsPaise,
      totalInvestmentPaise: inv.currentInvestmentPaise,
      totalAdditionalIncomePaise,
      fundingGapPaise: 0,
      holdingDays,
      profitPaise,
      mySharePaise: profitPaise != null ? mySharePaise : asset.mySharePaise,
      partnerSharePaise: profitPaise != null ? partnerSharePaise : asset.partnerSharePaise,
      operatingPartnerProfitPaise:
        profitPaise != null ? operatingPartnerProfitPaise : asset.operatingPartnerProfitPaise,
      investorProfitPoolPaise: profitPaise != null ? mySharePaise : asset.investorProfitPoolPaise,
      partnerSharePctBps:
        profitPaise != null
          ? asset.profitDistributionMode === 'PARTNERSHIP_50_50'
            ? 5000
            : 0
          : asset.partnerSharePctBps,
      mySharePctBps:
        profitPaise != null
          ? asset.profitDistributionMode === 'PARTNERSHIP_50_50'
            ? 5000
            : 10000
          : asset.mySharePctBps,
      myInvestmentPctBps: 10000,
      roiBps: roiFields.roiBps,
      businessRoiBps: roiFields.businessRoiBps,
      myRoiBps: roiFields.myRoiBps,
      capitalReturnedPaise: 0,
      profitReceivedPaise: 0,
      outstandingPaise: 0,
      settlementPctBps: null,
      updatedAt: new Date(),
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
  const expectedPaise = Math.max(0, Math.round(input.expectedTotalInvestmentPaise));

  return capitalDb.transaction(async (tx) => {
    const [asset] = await tx
      .insert(acAssets)
      .values({
        displayName,
        purchaseDate: input.purchaseDate,
        purchasePricePaise: 0,
        sellerPricePaise: 0,
        expectedTotalInvestmentPaise: expectedPaise,
        currentInvestmentPaise: 0,
        budgetRemainingPaise: expectedPaise,
        totalInvestmentPaise: 0,
        outstandingPaise: 0,
        fundingGapPaise: 0,
        repairTotalPaise: 0,
        dealerRefundTotalPaise: 0,
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
          expectedTotalInvestmentPaise: expectedPaise,
        },
      },
      tx,
    );

    await recalculateAsset(asset.id, tx);
    const [fresh] = await tx.select().from(acAssets).where(eq(acAssets.id, asset.id)).limit(1);
    return fresh ?? asset;
  });
}

export async function updateAssetStatus(assetId: string, status: string) {
  if (!isAssetLifecycleStatus(status)) {
    throw new Error(`Unknown lifecycle status: ${status}`);
  }
  if (status === 'sold' || status === 'settled') {
    throw new Error(`Use the dedicated workflow to mark an asset as ${lifecycleLabel(status)}`);
  }

  const [before] = await capitalDb.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
  if (!before) throw new Error('Asset not found');
  if (TERMINAL_STATUSES.has(before.status)) {
    throw new Error(`Cannot change status of a ${lifecycleLabel(before.status)} vehicle`);
  }

  if (status === 'cancelled') {
    return cancelAsset(assetId, 'Archived from lifecycle control');
  }

  if (!canTransition(before.status, status)) {
    throw new Error(
      `Cannot move from ${lifecycleLabel(before.status)} to ${lifecycleLabel(status)}`,
    );
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

/** Archive vehicle (status → cancelled). */
export async function cancelAsset(assetId: string, reason: string) {
  const [before] = await capitalDb.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
  if (!before) throw new Error('Asset not found');
  if (before.status === 'cancelled') throw new Error('Vehicle is already archived');
  if (before.status === 'settled') {
    throw new Error('Cannot archive a settled vehicle');
  }
  if (before.status === 'sold') {
    throw new Error('Settle or keep as Sold — archive is for pre-sale removals');
  }
  if (!canArchive(before.status)) {
    throw new Error(`Cannot archive from ${lifecycleLabel(before.status)}`);
  }

  await capitalDb
    .update(acAssets)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelReason: reason.trim() || 'Archived',
      updatedAt: new Date(),
    })
    .where(eq(acAssets.id, assetId));

  await logActivity({
    action: 'asset_status_changed',
    entityType: 'asset',
    entityId: assetId,
    beforeState: { status: before.status },
    afterState: { status: 'cancelled', reason },
  });
}

export async function updateAssetFunding(assetId: string, investors: InvestorFundingInput[]) {
  const asset = await assertAssetMutable(assetId);
  if (asset.status === 'sold') {
    throw new Error('Cannot change funding after sale');
  }

  await recalculateAsset(assetId);
  const [fresh] = await capitalDb.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
  if (!fresh) throw new Error('Asset not found');

  const funding = validateFundingStructure(fresh.purchasePricePaise, investors);
  const existing = await listAssetInvestors(assetId);

  await capitalDb.transaction(async (tx) => {
    for (const row of funding) {
      const prior = existing.find((e) => e.slot === row.slot);
      if (prior) {
        await tx
          .update(acAssetInvestors)
          .set({
            label: row.label,
            investedPaise: row.investedPaise,
            profitPaise: null,
            roiBps: null,
            updatedAt: new Date(),
          })
          .where(eq(acAssetInvestors.id, prior.id));
      } else {
        await tx.insert(acAssetInvestors).values({
          assetId,
          slot: row.slot,
          label: row.label,
          investedPaise: row.investedPaise,
        });
      }
    }

    for (const prior of existing) {
      if (prior.slot === 'me') continue;
      if (!funding.some((f) => f.slot === prior.slot)) {
        await tx.delete(acAssetInvestors).where(eq(acAssetInvestors.id, prior.id));
      }
    }
  });

  await recalculateAsset(assetId);
  await logActivity({
    action: 'asset_updated',
    entityType: 'asset',
    entityId: assetId,
    afterState: {
      funding: funding.map((f) => ({
        slot: f.slot,
        label: f.label,
        investedPaise: f.investedPaise,
      })),
    },
  });
}

export type UpdateAssetDetailsInput = {
  assetId: string;
  manufacturer: string;
  model: string;
  year: number;
  fuelType: 'petrol' | 'diesel' | 'cng' | 'ev' | 'hybrid';
  ownership: 'first_owner' | 'second_owner' | 'third_owner';
  registrationNumber?: string;
  /** Seller price (negotiated). 0 allowed until set. */
  sellerPricePaise?: number;
  /** @deprecated Prefer sellerPricePaise — kept for EditVehicleForm compatibility. */
  purchasePricePaise?: number;
  expectedTotalInvestmentPaise?: number;
  purchaseDate?: string;
  notes?: string;
};

/** Edit core vehicle fields; seller price / expected budget trigger investment recalc. */
export async function updateAssetDetails(input: UpdateAssetDetailsInput) {
  const asset = await assertAssetMutable(input.assetId);
  if (asset.status === 'sold') {
    throw new Error('Cannot edit vehicle details after sale');
  }

  const sellerPricePaise = Math.max(
    0,
    Math.round(
      input.sellerPricePaise ??
        input.purchasePricePaise ??
        asset.sellerPricePaise ??
        asset.purchasePricePaise ??
        0,
    ),
  );
  const expectedPaise =
    input.expectedTotalInvestmentPaise != null
      ? Math.max(0, Math.round(input.expectedTotalInvestmentPaise))
      : asset.expectedTotalInvestmentPaise;

  const displayName = `${input.year} ${input.manufacturer} ${input.model}`;

  await capitalDb.transaction(async (tx) => {
    await tx
      .update(acAssets)
      .set({
        displayName,
        purchasePricePaise: sellerPricePaise,
        sellerPricePaise,
        expectedTotalInvestmentPaise: expectedPaise,
        purchaseDate: input.purchaseDate ?? asset.purchaseDate,
        notes: input.notes ?? asset.notes,
        updatedAt: new Date(),
      })
      .where(eq(acAssets.id, input.assetId));

    await tx
      .update(acAutomotiveDetails)
      .set({
        manufacturer: input.manufacturer,
        model: input.model,
        year: input.year,
        fuelType: input.fuelType,
        ownership: input.ownership,
        registrationNumber: input.registrationNumber
          ? normalizeRegistration(input.registrationNumber)
          : null,
      })
      .where(eq(acAutomotiveDetails.assetId, input.assetId));

    await logActivity(
      {
        action: 'asset_details_updated',
        entityType: 'asset',
        entityId: input.assetId,
        afterState: {
          displayName,
          sellerPricePaise,
          expectedTotalInvestmentPaise: expectedPaise,
          manufacturer: input.manufacturer,
          model: input.model,
        },
      },
      tx,
    );

    await recalculateAsset(input.assetId, tx);
  });
}

/** Set/edit Expected Total Investment (budget). */
export async function updateExpectedTotalInvestment(
  assetId: string,
  expectedTotalInvestmentPaise: number,
) {
  await assertAssetMutable(assetId);
  const expectedPaise = Math.max(0, Math.round(expectedTotalInvestmentPaise));
  await capitalDb
    .update(acAssets)
    .set({ expectedTotalInvestmentPaise: expectedPaise, updatedAt: new Date() })
    .where(eq(acAssets.id, assetId));
  await recalculateAsset(assetId);
  await logActivity({
    action: 'asset_details_updated',
    entityType: 'asset',
    entityId: assetId,
    afterState: { expectedTotalInvestmentPaise: expectedPaise },
  });
}

/** Set/edit Seller Price. */
export async function updateSellerPrice(assetId: string, sellerPricePaise: number) {
  await assertAssetMutable(assetId);
  const price = Math.max(0, Math.round(sellerPricePaise));
  await capitalDb
    .update(acAssets)
    .set({
      sellerPricePaise: price,
      purchasePricePaise: price,
      updatedAt: new Date(),
    })
    .where(eq(acAssets.id, assetId));
  await recalculateAsset(assetId);
  await logActivity({
    action: 'asset_details_updated',
    entityType: 'asset',
    entityId: assetId,
    afterState: { sellerPricePaise: price },
  });
}

export async function recordSale(
  assetId: string,
  actualSalePricePaise: number,
  saleDate: string,
  profitDistributionMode: 'SELF' | 'PARTNERSHIP_50_50',
  buyerName?: string | null,
) {
  await assertAssetMutable(assetId);

  await recalculateAsset(assetId);
  const [fresh] = await capitalDb.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
  if (!fresh) throw new Error('Asset not found');

  const sellerPrice = Math.round(fresh.sellerPricePaise || fresh.purchasePricePaise || 0);
  if (sellerPrice <= 0 && fresh.currentInvestmentPaise <= 0) {
    throw new Error('Set seller price (or costs) before recording a sale');
  }

  const currentInvestment = fresh.currentInvestmentPaise;
  const additionalIncome = fresh.totalAdditionalIncomePaise ?? 0;
  const businessProfit = computeGrossDealProfit(
    actualSalePricePaise,
    currentInvestment,
    additionalIncome,
  );
  const split = splitDealProfit(businessProfit, profitDistributionMode);
  const rois = computeVehicleRois({
    grossProfitPaise: businessProfit,
    totalVehicleCostPaise: Math.max(currentInvestment, 1),
    myProfitPaise: split.myProfitPaise,
    myInvestedPaise: Math.max(currentInvestment, 1),
  });

  await capitalDb
    .update(acAssets)
    .set({
      actualSalePricePaise,
      saleDate,
      buyerName: buyerName?.trim() || null,
      status: 'sold',
      profitDistributionMode,
      profitShareMode: 'percentage',
      partnerSharePctBps: profitDistributionMode === 'PARTNERSHIP_50_50' ? 5000 : 0,
      mySharePctBps: profitDistributionMode === 'PARTNERSHIP_50_50' ? 5000 : 10000,
      myInvestmentPctBps: 10000,
      partnerSharePaise: split.partnerProfitPaise,
      operatingPartnerProfitPaise: split.partnerProfitPaise,
      investorProfitPoolPaise: split.myProfitPaise,
      mySharePaise: split.myProfitPaise,
      profitPaise: businessProfit,
      businessRoiBps: rois.businessRoiBps,
      myRoiBps: rois.myRoiBps,
      roiBps: rois.roiBps,
      updatedAt: new Date(),
    })
    .where(eq(acAssets.id, assetId));

  await recalculateAsset(assetId);
  await logActivity({
    action: 'asset_status_changed',
    entityType: 'asset',
    entityId: assetId,
    beforeState: { status: fresh.status },
    afterState: { status: 'sold' },
  });
  await logActivity({
    action: 'sale_recorded',
    entityType: 'asset',
    entityId: assetId,
    afterState: {
      actualSalePricePaise,
      saleDate,
      buyerName: buyerName?.trim() || null,
      status: 'sold',
      profitDistributionMode,
      businessProfitPaise: businessProfit,
      mySharePaise: split.myProfitPaise,
      partnerProfitPaise: split.partnerProfitPaise,
    },
  });

  try {
    const { emitVehicleSoldEvent } = await import('@/src/owner/events/emitters');
    emitVehicleSoldEvent({
      assetId,
      salePricePaise: actualSalePricePaise,
      saleDate,
    });
  } catch {
    // Owner OS inbox is best-effort.
  }
}

export async function updateProfitDistributionMode(
  assetId: string,
  mode: 'SELF' | 'PARTNERSHIP_50_50',
) {
  const [asset] = await capitalDb.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
  if (!asset) throw new Error('Asset not found');
  if (asset.status === 'cancelled') {
    throw new Error('Cannot change profit distribution on a cancelled vehicle');
  }
  if (asset.actualSalePricePaise == null) {
    throw new Error('Profit distribution is set when recording the sale');
  }

  const before = asset.profitDistributionMode;
  const modeChanged = before !== mode;

  // Sold + unchanged mode: still recalculate so my_share_paise heals if stale.
  if (!modeChanged) {
    await recalculateAsset(assetId);
    const [same] = await capitalDb.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
    return same ?? asset;
  }

  await capitalDb.transaction(async (tx) => {
    await tx
      .update(acAssets)
      .set({ profitDistributionMode: mode, updatedAt: new Date() })
      .where(eq(acAssets.id, assetId));

    await recalculateAsset(assetId, tx);

    await logActivity(
      {
        action: 'profit_distribution_mode_changed',
        entityType: 'asset',
        entityId: assetId,
        beforeState: { profitDistributionMode: before },
        afterState: { profitDistributionMode: mode },
      },
      tx,
    );
  });

  const [fresh] = await capitalDb.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
  return fresh ?? asset;
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
  } else if (query.inventoryTab && !query.activeOnly && !query.paymentEligibleOnly) {
    // Inventory tabs (assets page only — listAssets helpers omit inventoryTab)
    const tab = query.inventoryTab;
    if (tab === 'in_stock') {
      conditions.push(openInventorySql());
    } else if (tab === 'purchase_pending') {
      // Seller Remaining only — never funding gap (audit H6)
      conditions.push(eq(acAssets.status, 'purchased'));
      conditions.push(sql`(
        ${acAssets.purchasePricePaise} > 0
        AND COALESCE((
          SELECT SUM(sp.amount_paise)
          FROM ac_seller_payments sp
          WHERE sp.asset_id = ${acAssets.id}
            AND sp.is_reversed = false
        ), 0) < ${acAssets.purchasePricePaise}
      )`);
    } else if (tab === 'under_repair') {
      conditions.push(sql`${acAssets.status} IN ('repairing', 'painting')`);
    } else if (tab === 'ready') {
      conditions.push(eq(acAssets.status, 'ready'));
    } else if (tab === 'listed') {
      conditions.push(eq(acAssets.status, 'listed'));
    } else if (tab === 'sold') {
      conditions.push(sql`${acAssets.status} IN ('sold', 'settled')`);
    } else if (tab === 'archived') {
      conditions.push(eq(acAssets.status, 'cancelled'));
    }
    // 'all' → no status filter
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

  const assetIds = rows.map((r) => r.asset.id);
  const partnerByAsset = new Map<string, string>();
  if (assetIds.length > 0) {
    const partners = await capitalDb
      .select({
        assetId: acAssetInvestors.assetId,
        label: acAssetInvestors.label,
        investedPaise: acAssetInvestors.investedPaise,
      })
      .from(acAssetInvestors)
      .where(
        and(
          inArray(acAssetInvestors.assetId, assetIds),
          eq(acAssetInvestors.slot, 'investor_2'),
        ),
      );
    for (const p of partners) {
      if (p.investedPaise > 0) partnerByAsset.set(p.assetId, p.label);
    }
  }

  const total = Number(countRow?.c ?? 0);
  const mappedRows = rows.map((r) => ({
    ...r,
    partnerLabel: partnerByAsset.get(r.asset.id) ?? null,
  }));

  return {
    rows: mappedRows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize),
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
  const [vehicleActivities, auditLog, ledger, payments, documents, openAdvances] =
    await Promise.all([
      capitalDb
        .select()
        .from(acVehicleActivities)
        .where(
          and(
            eq(acVehicleActivities.assetId, assetId),
            eq(acVehicleActivities.isReversed, false),
          ),
        )
        .orderBy(desc(acVehicleActivities.activityAt), desc(acVehicleActivities.createdAt)),
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
        .from(acPaymentsReceived)
        .where(
          and(eq(acPaymentsReceived.assetId, assetId), eq(acPaymentsReceived.isReversed, false)),
        )
        .orderBy(desc(acPaymentsReceived.receivedAt)),
      capitalDb.select().from(acDocuments).where(eq(acDocuments.assetId, assetId)),
      capitalDb
        .select()
        .from(acRepairAdvances)
        .where(and(eq(acRepairAdvances.assetId, assetId), eq(acRepairAdvances.status, 'open')))
        .orderBy(asc(acRepairAdvances.createdAt)),
    ]);

  return {
    vehicleActivities,
    activities: auditLog,
    /** Chronological merge of purchase activities + lifecycle state changes */
    timelineEvents: buildMergedTimeline(vehicleActivities, auditLog),
    ledger,
    payments,
    documents,
    openAdvances,
    /** @deprecated Prefer vehicleActivities — kept empty for old callers */
    expenses: [] as { id: string; description: string; expenseDate: string; amountPaise: number }[],
  };
}

const LIFECYCLE_AUDIT_ACTIONS = new Set([
  'asset_created',
  'asset_status_changed',
  'sale_recorded',
  'asset_sold',
  'settlement_created',
]);

function buildMergedTimeline(
  vehicleActivities: (typeof acVehicleActivities.$inferSelect)[],
  auditLog: (typeof acActivityLog.$inferSelect)[],
) {
  type Event = {
    id: string;
    kind: 'activity' | 'state';
    sortAt: string;
    activityAt?: string;
    activityType?: string;
    amountPaise?: number | null;
    title?: string | null;
    notes?: string | null;
    metadata?: unknown;
    action?: string;
    beforeState?: unknown;
    afterState?: unknown;
    createdAt: string;
  };

  const events: Event[] = [];

  for (const a of vehicleActivities) {
    const created =
      a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt);
    events.push({
      id: `act-${a.id}`,
      kind: 'activity',
      sortAt: `${a.activityAt}T12:00:00.000Z`,
      activityAt: a.activityAt,
      activityType: a.activityType,
      amountPaise: a.amountPaise,
      title: a.title,
      notes: a.notes,
      metadata: a.metadata,
      createdAt: created,
    });
  }

  for (const a of auditLog) {
    if (!LIFECYCLE_AUDIT_ACTIONS.has(a.action)) continue;
    const created =
      a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt);
    events.push({
      id: `state-${a.id}`,
      kind: 'state',
      sortAt: created,
      action: a.action,
      beforeState: a.beforeState,
      afterState: a.afterState,
      createdAt: created,
    });
  }

  events.sort((x, y) => y.sortAt.localeCompare(x.sortAt));
  return events;
}

export async function getAssetDetail(assetId: string) {
  const [row] = await capitalDb
    .select({ asset: acAssets, auto: acAutomotiveDetails })
    .from(acAssets)
    .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
    .where(eq(acAssets.id, assetId))
    .limit(1);
  if (!row) return null;
  const investors = await listAssetInvestors(assetId);
  return { ...row, investors };
}
