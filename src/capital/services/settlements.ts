import { and, eq } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import { acAssets, acPaymentsReceived, acSettlements } from '@/src/capital/db/schema';
import { postLedgerEntry } from './ledger';
import { logActivity } from './activity';
import { recalculateAsset } from './assets';

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

    if (asset.outstandingPaise > 0) {
      throw new Error(
        `Cannot settle: ₹${(asset.outstandingPaise / 100).toLocaleString('en-IN')} capital still outstanding`,
      );
    }

    const recovered = asset.capitalReturnedPaise + asset.profitReceivedPaise;
    if (asset.settlementPctBps != null && asset.settlementPctBps < 10000) {
      throw new Error('Settlement percentage must be 100% before marking settled');
    }

    const payments = await tx
      .select()
      .from(acPaymentsReceived)
      .where(and(eq(acPaymentsReceived.assetId, assetId), eq(acPaymentsReceived.isReversed, false)));

    const totalReceived = payments.reduce((s, p) => s + p.amountPaise, 0);
    const grossProfit =
      asset.profitPaise ?? (asset.actualSalePricePaise ?? 0) - asset.totalInvestmentPaise;

    // Stored deal economics: myShare = my Investor Pool slice; partnerShare = Sufii (operating partner)
    const adminShare = asset.mySharePaise ?? 0;
    const partnerShare =
      asset.operatingPartnerProfitPaise ?? asset.partnerSharePaise ?? grossProfit - adminShare;

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
    // Profit share split is stored in ac_settlements; do not re-credit ledger.
    await postLedgerEntry(
      {
        entryType: 'settlement',
        direction: 'credit',
        amountPaise: 0,
        assetId,
        sourceTable: 'ac_settlements',
        sourceId: settlement.id,
        description: `Settlement recorded: ${asset.displayName}`,
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
        action: 'settlement_created',
        entityType: 'settlement',
        entityId: settlement.id,
        afterState: { assetId, grossProfit, adminShare, partnerShare },
      },
      tx,
    );

    return settlement;
  });
}
