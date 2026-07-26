import { and, eq } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import { acAssets, acPaymentsReceived, acSettlements } from '@/src/capital/db/schema';
import { computeGrossDealProfit } from '@/src/capital/lib/dealEconomics';
import { postLedgerEntry } from './ledger';
import { logActivity } from './activity';
import { recalculateAsset } from './assets';

/**
 * Close a sold deal (dealership OS).
 * Settle = “deal closed” after sale — no capital-return payment gate (ADR-020 / audit H3).
 */
export async function createSettlement(assetId: string, notes?: string) {
  return capitalDb.transaction(async (tx) => {
    const [asset] = await tx.select().from(acAssets).where(eq(acAssets.id, assetId)).limit(1);
    if (!asset) throw new Error('Asset not found');
    if (asset.status === 'settled') throw new Error('Asset is already settled');
    if (asset.status !== 'sold') throw new Error('Asset must be sold before settlement');

    const [existingSettlement] = await tx
      .select()
      .from(acSettlements)
      .where(eq(acSettlements.assetId, assetId))
      .limit(1);
    if (existingSettlement) throw new Error('Settlement already exists for this asset');

    const payments = await tx
      .select()
      .from(acPaymentsReceived)
      .where(and(eq(acPaymentsReceived.assetId, assetId), eq(acPaymentsReceived.isReversed, false)));

    const totalReceived = payments.reduce((s, p) => s + p.amountPaise, 0);
    const grossProfit =
      asset.profitPaise ??
      (asset.actualSalePricePaise != null
        ? computeGrossDealProfit(asset.actualSalePricePaise, asset.totalInvestmentPaise)
        : 0);

    // Stored deal economics: myShare = my Investor Pool slice; partnerShare = Sufii (operating partner)
    const adminShare = asset.mySharePaise ?? 0;
    const partnerShare =
      asset.operatingPartnerProfitPaise ?? asset.partnerSharePaise ?? grossProfit - adminShare;

    const recovered = asset.capitalReturnedPaise + asset.profitReceivedPaise;

    const [settlement] = await tx
      .insert(acSettlements)
      .values({
        assetId,
        settledAt: new Date().toISOString().slice(0, 10),
        totalInvestmentPaise: asset.totalInvestmentPaise,
        totalReceivedPaise: totalReceived,
        grossProfitPaise: grossProfit,
        adminSharePaise: adminShare,
        partnerSharePaise: partnerShare,
        notes,
      })
      .returning();

    // Marker entry only — cash was already credited via payment_received entries.
    await postLedgerEntry(
      {
        entryType: 'settlement',
        direction: 'credit',
        amountPaise: 0,
        assetId,
        sourceTable: 'ac_settlements',
        sourceId: settlement.id,
        description: `Deal closed: ${asset.displayName}`,
        metadata: {
          totalReceivedPaise: totalReceived,
          grossProfitPaise: grossProfit,
          adminSharePaise: adminShare,
          partnerSharePaise: partnerShare,
          recoveredPaise: recovered,
        },
      },
      tx,
    );

    await tx
      .update(acAssets)
      .set({ status: 'settled', updatedAt: new Date() })
      .where(eq(acAssets.id, assetId));

    await recalculateAsset(assetId, tx);
    await logActivity(
      {
        action: 'asset_status_changed',
        entityType: 'asset',
        entityId: assetId,
        beforeState: { status: 'sold' },
        afterState: { status: 'settled' },
      },
      tx,
    );
    await logActivity(
      {
        action: 'settlement_created',
        entityType: 'asset',
        entityId: assetId,
        afterState: { settlementId: settlement.id, grossProfit, adminShare, partnerShare },
      },
      tx,
    );

    return settlement;
  });
}
