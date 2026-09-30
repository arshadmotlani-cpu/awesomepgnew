import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildAttributionPlan } from '../../../src/hair/domain/basket/attribution.ts';
import type { PricedLine } from '../../../src/hair/domain/basket/types.ts';
import {
  isPerformanceRevenueMetric,
  isProductSalesRevenueMetric,
  staffCombinedAttributedPaise,
  staffProductSalesPaise,
  staffServicePerformancePaise,
  type StaffMetricParts,
} from '../../../src/hair/domain/staffPerformance/metrics.ts';
import { allocatePerformancePaise } from '../../../src/hair/lib/attributionMath.ts';
import {
  performanceAmountFromMetricParts,
  productSalesFromMetricParts,
} from '../../../src/hair/services/staffPerformance.ts';

function parts(overrides: Partial<StaffMetricParts> = {}): StaffMetricParts {
  return {
    servicePaise: 0,
    productPaise: 0,
    packagePaise: 0,
    membershipPaise: 0,
    ...overrides,
  };
}

function pricedLine(
  type: PricedLine['billableRef']['type'],
  basePaise: number,
  staff: PricedLine['staff'],
): PricedLine {
  return {
    lineId: 'l1',
    billableRef: { id: 'ref1', type },
    snapshot: {
      name: 'Test',
      code: null,
      unitSellingPricePaise: basePaise,
      gstBps: 0,
      staffMode: type === 'service' ? 'SERVICE' : 'SALE',
      category: null,
    },
    quantity: 1,
    catalogGrossPaise: basePaise,
    lineGrossPaise: basePaise,
    finalLinePaise: basePaise,
    discountPaise: 0,
    discountBps: 0,
    basePaise,
    gstPaise: 0,
    staff,
    serviceId: type === 'service' ? 'ref1' : null,
    productId: type === 'product' ? 'ref1' : null,
    packageId: type === 'package' ? 'ref1' : null,
    membershipId: type === 'membership' ? 'ref1' : null,
    primaryStaffId: staff[0]?.staffId ?? null,
  };
}

test('physical product sale is product sales and not service performance', () => {
  const row = parts({ productPaise: 80_000 });
  assert.equal(staffProductSalesPaise(row), 80_000);
  assert.equal(staffServicePerformancePaise(row), 0);
  assert.equal(isProductSalesRevenueMetric('product'), true);
});

test('normal service, membership, and package are excluded from product sales', () => {
  const row = parts({ servicePaise: 50_000, membershipPaise: 20_000, packagePaise: 30_000 });
  assert.equal(staffProductSalesPaise(row), 0);
  assert.equal(productSalesFromMetricParts(50_000, 0, 30_000, 20_000), 0);
});

test('service performance includes service, membership, and package without double counting', () => {
  const row = parts({
    servicePaise: 50_000,
    productPaise: 80_000,
    membershipPaise: 20_000,
    packagePaise: 30_000,
  });
  assert.equal(staffServicePerformancePaise(row), 100_000);
  assert.equal(performanceAmountFromMetricParts(50_000, 30_000, 20_000), 100_000);
  assert.equal(
    staffProductSalesPaise(row) + staffServicePerformancePaise(row),
    staffCombinedAttributedPaise(row),
  );
  assert.equal(isPerformanceRevenueMetric('service'), true);
  assert.equal(isPerformanceRevenueMetric('membership'), true);
  assert.equal(isPerformanceRevenueMetric('package'), true);
  assert.equal(isPerformanceRevenueMetric('product'), false);
});

test('a two-staff service split stays service performance and is unchanged by payment mode', () => {
  const split = allocatePerformancePaise(100_000, [{ staffId: 'a' }, { staffId: 'b' }]);
  assert.equal(split[0]!.attributedPaise, 50_000);
  assert.equal(split[1]!.attributedPaise, 50_000);
  for (const paymentMode of ['cash', 'upi', 'card', 'wallet', 'due']) {
    for (const share of split) {
      const row = parts({ servicePaise: share.attributedPaise });
      assert.equal(staffServicePerformancePaise(row), share.attributedPaise, paymentMode);
      assert.equal(staffProductSalesPaise(row), 0, paymentMode);
    }
  }
});

test('package purchase attribution is not product sales; redemption stays a service metric', () => {
  const purchase = buildAttributionPlan([
    pricedLine('package', 40_000, [{ staffId: 'a', shareBps: 10_000 }]),
  ]);
  assert.equal(purchase.length, 0);
  assert.equal(
    purchase.some((row) => row.revenueMetric === 'product'),
    false,
  );

  const redemption = buildAttributionPlan([
    {
      ...pricedLine('service', 0, [
        { staffId: 'a', shareBps: 5000 },
        { staffId: 'b', shareBps: 5000 },
      ]),
      basePaise: 0,
      prepaidRedemption: {
        kind: 'package_redemption',
        customerPackageId: 'pkg',
        creditId: 'cred',
        serviceId: 'ref1',
        packageName: 'Pack',
        effectiveUnitValuePaise: 10_000,
        retailUnitValuePaise: 20_000,
      },
    },
  ]);
  assert.equal(redemption.length, 2);
  assert.equal(redemption.every((row) => row.revenueMetric === 'service'), true);
  const classified = parts({
    servicePaise: redemption.reduce((sum, row) => sum + row.attributedBasePaise, 0),
  });
  assert.equal(staffServicePerformancePaise(classified), 10_000);
  assert.equal(staffProductSalesPaise(classified), 0);
});

test('product sales table does not list service, membership, package, or gift card columns', () => {
  const src = readFileSync(
    new URL('../../../src/hair/components/dashboard/StaffPerformanceCommandCenter.tsx', import.meta.url),
    'utf8',
  );
  const productBlock = src.slice(
    src.indexOf('title="Product sales by staff"'),
    src.indexOf('title="Service performance by staff"'),
  );
  assert.match(productBlock, /Product \(₹\)/);
  assert.doesNotMatch(productBlock, /Gift Card/);
  assert.doesNotMatch(productBlock, /Membership/);
  assert.doesNotMatch(productBlock, /Package/);
  assert.match(src, /Total service performance/);
});
