import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeGrossDealProfit,
  distributeDealProfits,
} from '../../../src/capital/lib/dealEconomics';

const INR = (r: number) => Math.round(r * 100);

/** Frozen regression fixtures — Purchase ₹5L, Sale ₹6L, Gross ₹1L */
const PURCHASE = INR(5_00_000);
const SALE = INR(6_00_000);
const GROSS = INR(1_00_000);
const FUNDING_ME = [{ slot: 'me' as const, investedPaise: PURCHASE, label: 'Me' }];

describe('Profit Distribution SSOT — Scenario A SELF', () => {
  const gross = computeGrossDealProfit(SALE, PURCHASE);
  const deal = distributeDealProfits({
    businessProfitPaise: gross,
    netVehicleCostPaise: PURCHASE,
    profitDistributionMode: 'SELF',
    funding: FUNDING_ME,
  });

  it('Gross Deal Profit = ₹1,00,000', () => {
    assert.equal(gross, GROSS);
  });

  it('My Profit = ₹1,00,000', () => {
    assert.equal(deal.myProfitPaise, INR(1_00_000));
  });

  it('Sufii Profit = ₹0', () => {
    assert.equal(deal.operatingPartnerSharePaise, 0);
  });

  it('My + Sufii = Gross', () => {
    assert.equal(deal.myProfitPaise + deal.operatingPartnerSharePaise, gross);
  });

  it('Business ROI 20% and My ROI 20%', () => {
    assert.equal(deal.businessRoiBps, 2000);
    assert.equal(deal.myRoiBps, 2000);
  });

  it('stored-shape fields match reports/dashboard reads', () => {
    // Surfaces read these columns — engine must produce them
    assert.equal(deal.businessProfitPaise, GROSS);
    assert.equal(deal.investorPoolPaise, deal.myProfitPaise);
    assert.equal(deal.profitDistributionMode, 'SELF');
  });
});

describe('Profit Distribution SSOT — Scenario B PARTNERSHIP_50_50', () => {
  const gross = computeGrossDealProfit(SALE, PURCHASE);
  const deal = distributeDealProfits({
    businessProfitPaise: gross,
    netVehicleCostPaise: PURCHASE,
    profitDistributionMode: 'PARTNERSHIP_50_50',
    funding: FUNDING_ME,
  });

  it('Gross Deal Profit = ₹1,00,000', () => {
    assert.equal(gross, GROSS);
  });

  it('My Profit = ₹50,000', () => {
    assert.equal(deal.myProfitPaise, INR(50_000));
  });

  it('Sufii Profit = ₹50,000', () => {
    assert.equal(deal.operatingPartnerSharePaise, INR(50_000));
  });

  it('My + Sufii = Gross', () => {
    assert.equal(deal.myProfitPaise + deal.operatingPartnerSharePaise, gross);
  });

  it('Business ROI 20% and My ROI 10%', () => {
    assert.equal(deal.businessRoiBps, 2000);
    assert.equal(deal.myRoiBps, 1000);
  });
});

describe('Profit Distribution SSOT — mode flip after sale', () => {
  const gross = computeGrossDealProfit(SALE, PURCHASE);

  it('SELF → PARTNERSHIP_50_50 recalculates My and Sufii', () => {
    const selfDeal = distributeDealProfits({
      businessProfitPaise: gross,
      netVehicleCostPaise: PURCHASE,
      profitDistributionMode: 'SELF',
      funding: FUNDING_ME,
    });
    const partnership = distributeDealProfits({
      businessProfitPaise: gross,
      netVehicleCostPaise: PURCHASE,
      profitDistributionMode: 'PARTNERSHIP_50_50',
      funding: FUNDING_ME,
    });
    assert.equal(selfDeal.myProfitPaise, INR(1_00_000));
    assert.equal(partnership.myProfitPaise, INR(50_000));
    assert.equal(partnership.operatingPartnerSharePaise, INR(50_000));
    assert.equal(selfDeal.businessProfitPaise, partnership.businessProfitPaise);
  });

  it('PARTNERSHIP_50_50 → SELF restores full My Profit', () => {
    const partnership = distributeDealProfits({
      businessProfitPaise: gross,
      netVehicleCostPaise: PURCHASE,
      profitDistributionMode: 'PARTNERSHIP_50_50',
      funding: FUNDING_ME,
    });
    const selfDeal = distributeDealProfits({
      businessProfitPaise: gross,
      netVehicleCostPaise: PURCHASE,
      profitDistributionMode: 'SELF',
      funding: FUNDING_ME,
    });
    assert.equal(partnership.myProfitPaise, INR(50_000));
    assert.equal(selfDeal.myProfitPaise, INR(1_00_000));
    assert.equal(selfDeal.operatingPartnerSharePaise, 0);
  });
});

describe('Profit Distribution SSOT — dashboard aggregation from stored My Profit', () => {
  it('one SELF + one PARTNERSHIP sums to ₹1,50,000 My (no page formulas)', () => {
    const gross = computeGrossDealProfit(SALE, PURCHASE);
    const selfMy = distributeDealProfits({
      businessProfitPaise: gross,
      netVehicleCostPaise: PURCHASE,
      profitDistributionMode: 'SELF',
      funding: FUNDING_ME,
    }).myProfitPaise;
    const partMy = distributeDealProfits({
      businessProfitPaise: gross,
      netVehicleCostPaise: PURCHASE,
      profitDistributionMode: 'PARTNERSHIP_50_50',
      funding: FUNDING_ME,
    }).myProfitPaise;
    // Mirrors overview/analytics: SUM(my_share_paise)
    assert.equal(selfMy + partMy, INR(1_50_000));
  });
});

describe('Profit Distribution SSOT — sale-time schemas', () => {
  it('createAssetSchema does not require or accept profitDistributionMode', async () => {
    const { createAssetSchema } = await import(
      '../../../src/capital/lib/validation/schemas'
    );
    const parsed = createAssetSchema.safeParse({
      manufacturer: 'MG',
      model: 'Hector',
      fuelType: 'diesel',
      year: 2021,
      ownership: 'first_owner',
      purchasePrice: 500000,
      meInvested: 500000,
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal('profitDistributionMode' in parsed.data, false);
    }
  });

  it('recordSaleSchema requires profitDistributionMode', async () => {
    const { recordSaleSchema } = await import(
      '../../../src/capital/lib/validation/schemas'
    );
    const missing = recordSaleSchema.safeParse({
      assetId: '00000000-0000-4000-8000-000000000001',
      salePrice: 600000,
      saleDate: '2026-07-22',
    });
    assert.equal(missing.success, false);

    const self = recordSaleSchema.safeParse({
      assetId: '00000000-0000-4000-8000-000000000001',
      salePrice: 600000,
      saleDate: '2026-07-22',
      profitDistributionMode: 'SELF',
    });
    assert.equal(self.success, true);
    if (self.success) {
      assert.equal(self.data.profitDistributionMode, 'SELF');
    }
  });
});
