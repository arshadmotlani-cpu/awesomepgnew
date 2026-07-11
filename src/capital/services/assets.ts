import { and, asc, count, desc, eq, ilike, or, sql, sum, type SQL } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import {
  acActivityLog,
  acAssetInvestors,
  acAssets,
  acAutomotiveDetails,
  acDocuments,
  acExpenses,
  acLedgerEntries,
  acPaymentsReceived,
  acSettings,
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
  computeFundingGap,
  computeNetVehicleCost,
  distributeDealProfits,
} from '@/src/capital/lib/dealEconomics';
import { computeVehicleRois } from '@/src/capital/lib/roi';
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
  /** Layer 2 funding — must sum to net vehicle cost (at create = purchase). Defaults to Me = 100%. */
  investors?: InvestorFundingInput[];
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

/** My capital stakes on open (active) vehicles only. */
export async function sumMyActiveInvestedCapitalPaise(
  db: CapitalDbClient = capitalDb,
): Promise<number> {
  const [row] = await db
    .select({ total: sum(acAssetInvestors.investedPaise) })
    .from(acAssetInvestors)
    .innerJoin(acAssets, eq(acAssetInvestors.assetId, acAssets.id))
    .where(
      and(
        eq(acAssetInvestors.slot, 'me'),
        sql`${acAssets.status} NOT IN ('sold', 'settled', 'cancelled')`,
      ),
    );
  return Number(row?.total ?? 0);
}

export async function recalculateAsset(assetId: string, db: CapitalDbClient = capitalDb) {
  const expenseRows = await db
    .select({ amountPaise: acExpenses.amountPaise })
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

  const cost = computeNetVehicleCost(asset.purchasePricePaise, expenseRows);
  const netVehicleCost = cost.netVehicleCostPaise;
  const capitalReturned = Number(paymentSums?.capital ?? 0);
  const profitReceived = Number(paymentSums?.profit ?? 0);
  const cashRefundPaise = Number(paymentSums?.refunds ?? 0);
  const recoveredPaise = capitalReturned + profitReceived;
  const profitPaise =
    asset.actualSalePricePaise != null ? asset.actualSalePricePaise - netVehicleCost : null;
  const holdingDays = calcHoldingDays(asset.purchaseDate, asset.saleDate);
  const settlementPctBps = calcSettlementPctBps(recoveredPaise, netVehicleCost);
  const outstandingPaise = netVehicleCost - capitalReturned + cashRefundPaise;

  if (capitalReturned > netVehicleCost) {
    throw new Error(
      `Capital returned (₹${capitalReturned / 100}) exceeds net vehicle cost (₹${netVehicleCost / 100}) for asset ${assetId}`,
    );
  }

  if (profitPaise != null && profitReceived > Math.max(0, asset.mySharePaise ?? profitPaise)) {
    throw new Error(
      `Profit received exceeds your share of profit for asset ${assetId}`,
    );
  }

  const investors = await db
    .select()
    .from(acAssetInvestors)
    .where(eq(acAssetInvestors.assetId, assetId));
  const totalInvested = investors.reduce((s, i) => s + i.investedPaise, 0);
  const fundingGapPaise = computeFundingGap(netVehicleCost, totalInvested);
  const me = investors.find((i) => i.slot === 'me');
  const myInvested = me?.investedPaise ?? asset.purchasePricePaise;
  const myShare = asset.mySharePaise ?? (profitPaise != null ? profitPaise : 0);
  const myInvestmentPctBps =
    totalInvested > 0 ? Math.round((myInvested * 10000) / totalInvested) : null;

  const roiFields =
    profitPaise != null
      ? computeVehicleRois({
          grossProfitPaise: profitPaise,
          totalVehicleCostPaise: netVehicleCost,
          myProfitPaise: myShare,
          myInvestedPaise: myInvested,
        })
      : { businessRoiBps: null, myRoiBps: null, roiBps: null };

  // Keep investor ROI rows in sync when profit already allocated
  if (profitPaise != null && investors.length > 0) {
    for (const inv of investors) {
      if (inv.profitPaise == null) continue;
      const invRoi =
        inv.investedPaise > 0
          ? Math.round((inv.profitPaise * 10000) / inv.investedPaise)
          : null;
      await db
        .update(acAssetInvestors)
        .set({ roiBps: invRoi, updatedAt: new Date() })
        .where(eq(acAssetInvestors.id, inv.id));
    }
  }

  await db
    .update(acAssets)
    .set({
      totalExpensePaise: cost.totalExpensePaise,
      repairTotalPaise: cost.repairTotalPaise,
      dealerRefundTotalPaise: cost.dealerRefundTotalPaise,
      totalInvestmentPaise: netVehicleCost,
      fundingGapPaise,
      myInvestmentPctBps,
      holdingDays,
      profitPaise,
      roiBps: roiFields.roiBps,
      businessRoiBps: roiFields.businessRoiBps,
      myRoiBps: roiFields.myRoiBps,
      capitalReturnedPaise: capitalReturned,
      profitReceivedPaise: profitReceived,
      outstandingPaise: Math.max(0, outstandingPaise),
      settlementPctBps,
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
  const funding = input.investors?.length
    ? validateFundingStructure(input.purchasePricePaise, input.investors)
    : fullSelfFunding(input.purchasePricePaise);

  return capitalDb.transaction(async (tx) => {
    const [asset] = await tx
      .insert(acAssets)
      .values({
        displayName,
        purchaseDate: input.purchaseDate,
        purchasePricePaise: input.purchasePricePaise,
        totalInvestmentPaise: input.purchasePricePaise,
        outstandingPaise: input.purchasePricePaise,
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

    await tx.insert(acAssetInvestors).values(
      funding.map((f) => ({
        assetId: asset.id,
        slot: f.slot,
        label: f.label,
        investedPaise: f.investedPaise,
      })),
    );

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
          investors: funding.map((f) => ({
            slot: f.slot,
            label: f.label,
            investedPaise: f.investedPaise,
          })),
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

export async function updateAssetFunding(assetId: string, investors: InvestorFundingInput[]) {
  const asset = await assertAssetMutable(assetId);
  if (asset.status === 'sold') {
    throw new Error('Cannot change funding after sale');
  }

  await recalculateAsset(assetId);
  const [fresh] = await capitalDb.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
  if (!fresh) throw new Error('Asset not found');

  const funding = validateFundingStructure(fresh.totalInvestmentPaise, investors);
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

    // Zero out slots that are no longer funded (except me — always kept)
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

export async function recordSale(
  assetId: string,
  actualSalePricePaise: number,
  saleDate: string,
) {
  await assertAssetMutable(assetId);

  await recalculateAsset(assetId);
  const [fresh] = await capitalDb.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
  if (!fresh) throw new Error('Asset not found');

  let investors = await listAssetInvestors(assetId);
  if (investors.length === 0) {
    // Legacy asset without Layer 2 — self-fund to current net cost
    const funding = fullSelfFunding(fresh.totalInvestmentPaise);
    await capitalDb.insert(acAssetInvestors).values(
      funding.map((f) => ({
        assetId,
        slot: f.slot,
        label: f.label,
        investedPaise: f.investedPaise,
      })),
    );
    investors = await listAssetInvestors(assetId);
    await recalculateAsset(assetId);
    const [again] = await capitalDb.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
    if (again) Object.assign(fresh, again);
  }

  if (fresh.fundingGapPaise !== 0) {
    const gap = fresh.fundingGapPaise;
    const direction = gap > 0 ? 'underfunded' : 'overfunded';
    throw new Error(
      `Cannot sell: vehicle is ${direction} by ₹${(Math.abs(gap) / 100).toLocaleString('en-IN')}. Update investments to equal net vehicle cost first.`,
    );
  }

  const [settings] = await capitalDb.select().from(acSettings).limit(1);
  const netVehicleCost = fresh.totalInvestmentPaise;
  const businessProfit = actualSalePricePaise - netVehicleCost;
  const deal = distributeDealProfits({
    businessProfitPaise: businessProfit,
    netVehicleCostPaise: netVehicleCost,
    settings: {
      numerator: settings?.profitShareNumerator ?? 1,
      denominator: settings?.profitShareDenominator ?? 2,
    },
    funding: investors.map((i) => ({
      slot: i.slot as InvestorSlot,
      investedPaise: i.investedPaise,
      label: i.label,
    })),
  });

  await capitalDb.transaction(async (tx) => {
    for (const row of deal.investors) {
      await tx
        .update(acAssetInvestors)
        .set({
          profitPaise: row.profitPaise,
          roiBps: row.roiBps,
          updatedAt: new Date(),
        })
        .where(
          and(eq(acAssetInvestors.assetId, assetId), eq(acAssetInvestors.slot, row.slot)),
        );
    }

    await tx
      .update(acAssets)
      .set({
        actualSalePricePaise,
        saleDate,
        status: 'sold',
        profitShareMode: 'percentage',
        partnerSharePctBps: deal.operatingPartnerPctBps,
        mySharePctBps: deal.myInvestmentPctBps,
        myInvestmentPctBps: deal.myInvestmentPctBps,
        partnerSharePaise: deal.operatingPartnerSharePaise,
        operatingPartnerProfitPaise: deal.operatingPartnerSharePaise,
        investorProfitPoolPaise: deal.investorPoolPaise,
        mySharePaise: deal.myProfitPaise,
        businessRoiBps: deal.businessRoiBps,
        myRoiBps: deal.myRoiBps,
        updatedAt: new Date(),
      })
      .where(eq(acAssets.id, assetId));
  });

  await recalculateAsset(assetId);
  await logActivity({
    action: 'asset_updated',
    entityType: 'asset',
    entityId: assetId,
    afterState: {
      actualSalePricePaise,
      saleDate,
      status: 'sold',
      businessProfitPaise: deal.businessProfitPaise,
      operatingPartnerProfitPaise: deal.operatingPartnerSharePaise,
      investorProfitPoolPaise: deal.investorPoolPaise,
      mySharePaise: deal.myProfitPaise,
      investors: deal.investors,
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
  if (!row) return null;
  const investors = await listAssetInvestors(assetId);
  return { ...row, investors };
}
