import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { buildAttributionPlan } from '@/src/hair/domain/basket/attribution';
import type { PricedLine } from '@/src/hair/domain/basket/types';
import { priceBasket } from '@/src/hair/domain/basket/engine';
import type { BasketLine } from '@/src/hair/domain/basket/types';
import {
  allocatePerformancePaise,
  normalizeEqualShares,
} from '@/src/hair/lib/attributionMath';
import { findLinesMissingStaffPerformer } from '@/src/hair/domain/basket/staffRequired';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

function serviceLine(
  basePaise: number,
  staff: PricedLine['staff'],
  prepaid?: PricedLine['prepaidRedemption'],
): PricedLine {
  return {
    lineId: 'l1',
    billableRef: { id: 'svc1', type: 'service' },
    snapshot: {
      name: 'Haircut',
      code: null,
      unitSellingPricePaise: basePaise,
      gstBps: 0,
      staffMode: 'SERVICE',
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
    serviceId: 'svc1',
    productId: null,
    packageId: null,
    membershipId: null,
    primaryStaffId: staff[0]?.staffId ?? null,
    prepaidRedemption: prepaid ?? null,
  };
}

describe('Quick Sale multi-staff performance', () => {
  it('1 — single performer gets full service value', () => {
    const rows = buildAttributionPlan([
      serviceLine(60_000, [{ staffId: 'nida', shareBps: 10_000 }]),
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.attributedBasePaise, 60_000);
    assert.equal(rows[0]!.role, 'serviced_by');
  });

  it('2 — two performers split 50/50 on ₹600', () => {
    const staff = normalizeEqualShares(['nida', 'roop']);
    const rows = buildAttributionPlan([serviceLine(60_000, staff)]);
    assert.equal(rows.length, 2);
    assert.equal(rows.reduce((s, r) => s + r.attributedBasePaise, 0), 60_000);
    assert.equal(rows[0]!.attributedBasePaise, 30_000);
    assert.equal(rows[1]!.attributedBasePaise, 30_000);
  });

  it('3 — three performers equal split', () => {
    const staff = normalizeEqualShares(['a', 'b', 'c']);
    const total = 60_000;
    const rows = buildAttributionPlan([serviceLine(total, staff)]);
    assert.equal(rows.length, 3);
    assert.equal(rows.reduce((s, r) => s + r.attributedBasePaise, 0), total);
  });

  it('4 — uneven paise remainder (₹100 / 3)', () => {
    const total = 10_000;
    const allocs = allocatePerformancePaise(total, normalizeEqualShares(['a', 'b', 'c']));
    assert.equal(allocs.length, 3);
    assert.equal(allocs.reduce((s, r) => s + r.attributedPaise, 0), total);
  });

  it('5 — package redemption splits effective value across two performers', () => {
    const staff = normalizeEqualShares(['nida', 'roop']);
    const line = serviceLine(0, staff, {
      kind: 'package_redemption',
      customerPackageId: 'cp1',
      creditId: 'cr1',
      serviceId: 'svc1',
      packageName: 'Pack',
      effectiveUnitValuePaise: 60_000,
      retailUnitValuePaise: 80_000,
    });
    const rows = buildAttributionPlan([line]);
    assert.equal(rows.reduce((s, r) => s + r.attributedBasePaise, 0), 60_000);
    assert.equal(rows.every((r) => r.revenueMetric === 'service'), true);
  });

  it('6 — duplicate performer prevented in staff UI', () => {
    const ui = read('src/hair/components/quick-sale/QuickSaleStaffFields.tsx');
    assert.match(ui, /staff\.some\(\(s\) => s\.staffId === pick\.id\)/);
    assert.match(ui, /normalizeEqualShares/);
  });

  it('7 — missing performer blocks checkout validation', () => {
    const basket = {
      customerId: 'c1',
      lines: [
        {
          lineId: 'l1',
          billableRef: { id: 's1', type: 'service' as const },
          snapshot: {
            name: 'Cut',
            code: null,
            unitSellingPricePaise: 500_00,
            gstBps: 0,
            staffMode: 'SERVICE' as const,
            category: null,
          },
          quantity: 1,
          overridePricePaise: null,
          staff: [],
        } satisfies BasketLine,
      ],
      payments: [],
      flags: {},
    };
    assert.equal(findLinesMissingStaffPerformer(basket).length, 1);
  });

  it('8 — single-staff basket regression via priceBasket', () => {
    const basket = {
      customerId: 'c1',
      lines: [
        {
          lineId: 'l1',
          billableRef: { id: 's1', type: 'service' as const },
          snapshot: {
            name: 'Cut',
            code: null,
            unitSellingPricePaise: 500_00,
            gstBps: 0,
            staffMode: 'SERVICE' as const,
            category: null,
          },
          quantity: 1,
          overridePricePaise: null,
          staff: [{ staffId: 'st1', shareBps: 10_000 }],
        } satisfies BasketLine,
      ],
      payments: [{ method: 'cash', amountPaise: 500_00 }],
      flags: {},
    };
    const priced = priceBasket(basket);
    assert.equal(priced.attributions.length, 1);
    assert.equal(priced.attributions[0]!.attributedBasePaise, priced.lines[0]!.basePaise);
  });

  it('9 — performance total equals eligible service value exactly', () => {
    const total = 59_999;
    const staff = normalizeEqualShares(['x', 'y', 'z']);
    const rows = buildAttributionPlan([serviceLine(total, staff)]);
    assert.equal(rows.reduce((s, r) => s + r.attributedBasePaise, 0), total);
  });
});
