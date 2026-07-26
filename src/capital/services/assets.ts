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
import { computeGrossDealProfit, computeFundingGap, distributeDealProfits } from '@/src/capital/lib/dealEconomics';
import { computeTotalVehicleInvestment } from '@/src/capital/lib/activityTypes';
import { computeTviFromCosts, summarizeVehicleCostBreakdown } from '@/src/capital/lib/threeLedgers';
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
import { postLedgerEntry } from './ledger';
import { acSellerPayments, acVehicleCosts } from '@/src/capital/db/schema';

const TERMINAL_STATUSES = new Set(['cancelled', 'settled']);

export type CreateAssetInput = {
  manufacturer: string;
  model: string;
  year: number;
  fuelType: 'petrol' | 'diesel' | 'cng' | 'ev' | 'hybrid';
  ownership: 'first_owner' | 'second_owner' | 'third_owner';
  purchaseDate: string;
  /** 0 allowed for token-first / purchase-pending creates. */
  purchasePricePaise: number;
  notes?: string;
  /** Layer 2 funding — must sum to purchase (0 when purchase pending). Defaults to Me = 100%. */
  investors?: InvestorFundingInput[];
  registrationNumber?: string;
  variant?: string;
  color?: string;
  /** Optional token milestone at create (cash_only — not added to TVI). */
  tokenPaidPaise?: number;
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

/** My capital stakes on open (active) vehicles only — ADR-015 Active Capital. */
export async function sumMyActiveInvestedCapitalPaise(
  db: CapitalDbClient = capitalDb,
): Promise<number> {
  const [row] = await db
    .select({ total: sum(acAssetInvestors.investedPaise) })
    .from(acAssetInvestors)
    .innerJoin(acAssets, eq(acAssetInvestors.assetId, acAssets.id))
    .where(and(eq(acAssetInvestors.slot, 'me'), openInventorySql()));
  return Number(row?.total ?? 0);
}

export async function recalculateAsset(assetId: string, db: CapitalDbClient = capitalDb) {
  const activityRows = await db
    .select({
      activityType: acVehicleActivities.activityType,
      amountPaise: acVehicleActivities.amountPaise,
    })
    .from(acVehicleActivities)
    .where(
      and(eq(acVehicleActivities.assetId, assetId), eq(acVehicleActivities.isReversed, false)),
    );

  const costRows = await db
    .select({
      amountPaise: acVehicleCosts.amountPaise,
      costType: acVehicleCosts.costType,
    })
    .from(acVehicleCosts)
    .where(and(eq(acVehicleCosts.assetId, assetId), eq(acVehicleCosts.isReversed, false)));

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

  // SSOT: TVI = purchase + ac_vehicle_costs (fed by activities). Activities fallback
  // only when cost ledger is empty (pre-migration / edge). Legacy ac_expenses never
  // enter TVI (ADR-016 / audit H2).
  const hasCostLedger = costRows.length > 0;
  const hasInvestmentActivities = activityRows.some(
    (r) =>
      r.activityType !== 'vehicle_created' &&
      r.activityType !== 'sale' &&
      r.amountPaise != null,
  );
  const cost = hasCostLedger
    ? (() => {
        const tvi = computeTviFromCosts({
          purchasePricePaise: asset.purchasePricePaise,
          costs: costRows,
        });
        const breakdown = summarizeVehicleCostBreakdown(costRows);
        return {
          totalExpensePaise: tvi.costsPaise,
          repairTotalPaise: breakdown.repairTotalPaise,
          dealerRefundTotalPaise: breakdown.dealerRefundTotalPaise,
          netVehicleCostPaise: tvi.totalVehicleInvestmentPaise,
        };
      })()
    : hasInvestmentActivities
      ? computeTotalVehicleInvestment({
          purchasePricePaise: asset.purchasePricePaise,
          activities: activityRows.map((r) => ({
            activityType: r.activityType,
            amountPaise: r.amountPaise,
          })),
        })
      : {
          totalExpensePaise: 0,
          repairTotalPaise: 0,
          dealerRefundTotalPaise: 0,
          netVehicleCostPaise: Math.round(asset.purchasePricePaise),
        };

  const netVehicleCost = cost.netVehicleCostPaise;
  const capitalReturned = Number(paymentSums?.capital ?? 0);
  const profitReceived = Number(paymentSums?.profit ?? 0);
  const cashRefundPaise = Number(paymentSums?.refunds ?? 0);
  const recoveredPaise = capitalReturned + profitReceived;
  const profitPaise =
    asset.actualSalePricePaise != null
      ? computeGrossDealProfit(asset.actualSalePricePaise, netVehicleCost)
      : null;
  const holdingDays = calcHoldingDays(asset.purchaseDate, asset.saleDate);
  const settlementPctBps = calcSettlementPctBps(recoveredPaise, Math.max(netVehicleCost, 1));
  const outstandingPaise = netVehicleCost - capitalReturned + cashRefundPaise;

  if (netVehicleCost > 0 && capitalReturned > netVehicleCost) {
    throw new Error(
      `Capital returned (₹${capitalReturned / 100}) exceeds net vehicle cost (₹${netVehicleCost / 100}) for asset ${assetId}`,
    );
  }

  let investors = await db
    .select()
    .from(acAssetInvestors)
    .where(eq(acAssetInvestors.assetId, assetId));

  // Sold deals must always redistribute from mode + funding. Legacy rows without
  // investor stakes bootstrap Me = purchase price so shares cannot stay stale.
  if (profitPaise != null && investors.length === 0) {
    const funding = fullSelfFunding(asset.purchasePricePaise);
    await db.insert(acAssetInvestors).values(
      funding.map((f) => ({
        assetId,
        slot: f.slot,
        label: f.label,
        investedPaise: f.investedPaise,
      })),
    );
    investors = await db
      .select()
      .from(acAssetInvestors)
      .where(eq(acAssetInvestors.assetId, assetId));
  }

  const totalInvested = investors.reduce((s, i) => s + i.investedPaise, 0);
  /** Funding gap vs purchase price (investor stakes), not vs activity cost */
  const fundingGapPaise = computeFundingGap(asset.purchasePricePaise, totalInvested);
  const me = investors.find((i) => i.slot === 'me');
  const myInvested = me?.investedPaise ?? asset.purchasePricePaise;
  const myInvestmentPctBps =
    totalInvested > 0 ? Math.round((myInvested * 10000) / totalInvested) : null;

  let myShare = asset.mySharePaise ?? (profitPaise != null ? profitPaise : 0);
  let partnerSharePaise = asset.partnerSharePaise;
  let operatingPartnerProfitPaise = asset.operatingPartnerProfitPaise;
  let investorProfitPoolPaise = asset.investorProfitPoolPaise;
  let partnerSharePctBps = asset.partnerSharePctBps;
  let dealMyInvestmentPctBps = asset.myInvestmentPctBps ?? myInvestmentPctBps;

  if (profitPaise != null && investors.length > 0) {
    const deal = distributeDealProfits({
      businessProfitPaise: profitPaise,
      netVehicleCostPaise: netVehicleCost > 0 ? netVehicleCost : asset.purchasePricePaise,
      profitDistributionMode: asset.profitDistributionMode ?? 'SELF',
      funding: investors.map((i) => ({
        slot: i.slot as InvestorSlot,
        investedPaise: i.investedPaise,
        label: i.label,
      })),
    });
    myShare = deal.myProfitPaise;
    partnerSharePaise = deal.operatingPartnerSharePaise;
    operatingPartnerProfitPaise = deal.operatingPartnerSharePaise;
    investorProfitPoolPaise = deal.investorPoolPaise;
    partnerSharePctBps = deal.operatingPartnerPctBps;
    dealMyInvestmentPctBps = deal.myInvestmentPctBps;

    for (const row of deal.investors) {
      await db
        .update(acAssetInvestors)
        .set({
          profitPaise: row.profitPaise,
          roiBps: row.roiBps,
          updatedAt: new Date(),
        })
        .where(and(eq(acAssetInvestors.assetId, assetId), eq(acAssetInvestors.slot, row.slot)));
    }
  }

  if (profitPaise != null && profitReceived > Math.max(0, myShare)) {
    throw new Error(
      `Profit received exceeds your share of profit for asset ${assetId}`,
    );
  }

  const roiFields =
    profitPaise != null
      ? computeVehicleRois({
          grossProfitPaise: profitPaise,
          totalVehicleCostPaise: netVehicleCost > 0 ? netVehicleCost : asset.purchasePricePaise,
          myProfitPaise: myShare,
          myInvestedPaise: myInvested,
        })
      : { businessRoiBps: null, myRoiBps: null, roiBps: null };

  await db
    .update(acAssets)
    .set({
      totalExpensePaise: cost.totalExpensePaise,
      repairTotalPaise: cost.repairTotalPaise,
      dealerRefundTotalPaise: cost.dealerRefundTotalPaise,
      totalInvestmentPaise: netVehicleCost,
      fundingGapPaise,
      myInvestmentPctBps: dealMyInvestmentPctBps ?? myInvestmentPctBps,
      mySharePctBps: dealMyInvestmentPctBps ?? myInvestmentPctBps,
      holdingDays,
      profitPaise,
      mySharePaise: profitPaise != null ? myShare : asset.mySharePaise,
      partnerSharePaise: profitPaise != null ? partnerSharePaise : asset.partnerSharePaise,
      operatingPartnerProfitPaise:
        profitPaise != null ? operatingPartnerProfitPaise : asset.operatingPartnerProfitPaise,
      investorProfitPoolPaise:
        profitPaise != null ? investorProfitPoolPaise : asset.investorProfitPoolPaise,
      partnerSharePctBps: profitPaise != null ? partnerSharePctBps : asset.partnerSharePctBps,
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
        // ADR-016: TVI starts at purchase price; investment-cost activities add on top
        totalInvestmentPaise: input.purchasePricePaise,
        outstandingPaise: input.purchasePricePaise,
        fundingGapPaise: 0,
        repairTotalPaise: 0,
        dealerRefundTotalPaise: 0,
        notes: input.notes,
        holdingDays: calcHoldingDays(input.purchaseDate),
        // profit_distribution_mode stays NULL until sale (sale-time property)
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

    // Timeline SSOT — no full purchase ledger debit (cash leaves via Token / Purchase Payment)
    await tx.insert(acVehicleActivities).values({
      assetId: asset.id,
      activityType: 'vehicle_created',
      activityAt: input.purchaseDate,
      title: 'Vehicle Created',
      notes: displayName,
      metadata: {
        manufacturer: input.manufacturer,
        model: input.model,
        purchasePricePaise: input.purchasePricePaise,
      },
    });

    const tokenPaise = Math.round(input.tokenPaidPaise ?? 0);
    if (tokenPaise > 0 && input.purchasePricePaise <= 0) {
      throw new Error('Set purchase price before recording a token payment');
    }
    if (tokenPaise > 0) {
      const [tokenPayment] = await tx
        .insert(acSellerPayments)
        .values({
          assetId: asset.id,
          amountPaise: tokenPaise,
          paidAt: input.purchaseDate,
          instrument: 'bank',
          kind: 'token',
          notes: 'Token at create',
        })
        .returning();

      const [tokenRow] = await tx
        .insert(acVehicleActivities)
        .values({
          assetId: asset.id,
          activityType: 'token_paid',
          activityAt: input.purchaseDate,
          amountPaise: tokenPaise,
          title: 'Token Paid',
          metadata: {
            fromCreate: true,
            sellerPaymentId: tokenPayment.id,
            instrument: 'bank',
          },
        })
        .returning();

      const entry = await postLedgerEntry(
        {
          entryType: 'adjustment',
          direction: 'debit',
          amountPaise: tokenPaise,
          assetId: asset.id,
          sourceTable: 'ac_seller_payments',
          sourceId: tokenPayment.id,
          description: 'Token Paid',
        },
        tx,
      );
      await tx
        .update(acVehicleActivities)
        .set({ ledgerEntryId: entry.id, updatedAt: new Date() })
        .where(eq(acVehicleActivities.id, tokenRow.id));
      await tx
        .update(acSellerPayments)
        .set({
          activityId: tokenRow.id,
          ledgerEntryId: entry.id,
          updatedAt: new Date(),
        })
        .where(eq(acSellerPayments.id, tokenPayment.id));
    }

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
  purchasePricePaise: number;
  purchaseDate?: string;
  notes?: string;
};

/** Edit core vehicle fields; purchase price change recalculates TVI and funding gap. */
export async function updateAssetDetails(input: UpdateAssetDetailsInput) {
  const asset = await assertAssetMutable(input.assetId);
  if (asset.status === 'sold') {
    throw new Error('Cannot edit vehicle details after sale');
  }
  if (input.purchasePricePaise <= 0) {
    throw new Error('Purchase price must be positive');
  }

  const displayName = `${input.year} ${input.manufacturer} ${input.model}`;

  await capitalDb.transaction(async (tx) => {
    await tx
      .update(acAssets)
      .set({
        displayName,
        purchasePricePaise: input.purchasePricePaise,
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
          purchasePricePaise: input.purchasePricePaise,
          manufacturer: input.manufacturer,
          model: input.model,
        },
      },
      tx,
    );

    await recalculateAsset(input.assetId, tx);

    // When price is first set (or raised from empty stakes), bootstrap Me = purchase price
    // so Active Capital / ROI base are not stuck at ₹0.
    const stakeRows = await tx
      .select()
      .from(acAssetInvestors)
      .where(eq(acAssetInvestors.assetId, input.assetId));
    const totalStakes = stakeRows.reduce((s, r) => s + r.investedPaise, 0);
    if (input.purchasePricePaise > 0 && totalStakes === 0) {
      const funding = fullSelfFunding(input.purchasePricePaise);
      for (const f of funding) {
        const prior = stakeRows.find((e) => e.slot === f.slot);
        if (prior) {
          await tx
            .update(acAssetInvestors)
            .set({ investedPaise: f.investedPaise, updatedAt: new Date() })
            .where(eq(acAssetInvestors.id, prior.id));
        } else {
          await tx.insert(acAssetInvestors).values({
            assetId: input.assetId,
            slot: f.slot,
            label: f.label,
            investedPaise: f.investedPaise,
          });
        }
      }
      await recalculateAsset(input.assetId, tx);
    }
  });
}

export async function recordSale(
  assetId: string,
  actualSalePricePaise: number,
  saleDate: string,
  profitDistributionMode: 'SELF' | 'PARTNERSHIP_50_50',
) {
  await assertAssetMutable(assetId);

  await recalculateAsset(assetId);
  const [fresh] = await capitalDb.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
  if (!fresh) throw new Error('Asset not found');

  let investors = await listAssetInvestors(assetId);
  if (investors.length === 0 || fresh.fundingGapPaise !== 0) {
    // Silent ownership sync — dealer never manages stakes / funding gap in the UI.
    const funding = fullSelfFunding(fresh.purchasePricePaise);
    await updateAssetFunding(
      assetId,
      funding.map((f) => ({
        slot: f.slot,
        investedPaise: f.investedPaise,
        label: f.label,
      })),
    );
    investors = await listAssetInvestors(assetId);
    await recalculateAsset(assetId);
    const [again] = await capitalDb.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
    if (again) Object.assign(fresh, again);
  }

  if (fresh.purchasePricePaise <= 0) {
    throw new Error('Set purchase price before recording a sale');
  }

  const netVehicleCost = fresh.totalInvestmentPaise;
  const businessProfit = computeGrossDealProfit(actualSalePricePaise, netVehicleCost);
  const deal = distributeDealProfits({
    businessProfitPaise: businessProfit,
    netVehicleCostPaise: netVehicleCost,
    profitDistributionMode,
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
        profitDistributionMode,
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
      status: 'sold',
      profitDistributionMode: deal.profitDistributionMode,
      businessProfitPaise: deal.businessProfitPaise,
      operatingPartnerProfitPaise: deal.operatingPartnerSharePaise,
      investorProfitPoolPaise: deal.investorPoolPaise,
      mySharePaise: deal.myProfitPaise,
      investors: deal.investors,
    },
  });
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
