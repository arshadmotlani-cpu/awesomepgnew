import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBasket } from '../../../src/hair/domain/basket/validate.ts';
import type { Basket, BasketLine } from '../../../src/hair/domain/basket/types.ts';

function baseLine(partial: Partial<BasketLine> & Pick<BasketLine, 'billableRef' | 'snapshot'>): BasketLine {
  return {
    lineId: partial.lineId ?? 'l1',
    billableRef: partial.billableRef,
    snapshot: partial.snapshot,
    quantity: partial.quantity ?? 1,
    overridePricePaise: partial.overridePricePaise ?? null,
    staff: partial.staff ?? [],
    prepaidRedemption: partial.prepaidRedemption,
  };
}

function basket(lines: BasketLine[]): Basket {
  return { customerId: 'c1', lines, payments: [], flags: {} };
}

test('validateBasket allows package purchase without staff', () => {
  const err = validateBasket(
    basket([
      baseLine({
        billableRef: { id: 'p1', type: 'package' },
        snapshot: {
          name: 'Pack',
          code: null,
          unitSellingPricePaise: 150000,
          gstBps: 0,
          staffMode: 'SALE',
          category: 'Package',
        },
        staff: [{ staffId: 's1', shareBps: 10_000 }],
      }),
    ]),
  );
  assert.equal(err, null);
});

test('validateBasket requires staff for prepaid redemption', () => {
  const err = validateBasket(
    basket([
      baseLine({
        billableRef: { id: 'svc1', type: 'service' },
        snapshot: {
          name: 'Wash',
          code: null,
          unitSellingPricePaise: 20000,
          gstBps: 1800,
          staffMode: 'SERVICE',
          category: 'Package Redemption',
        },
        overridePricePaise: 0,
        prepaidRedemption: {
          kind: 'package_redemption',
          customerPackageId: 'cp1',
          creditId: 'cr1',
          serviceId: 'svc1',
          packageName: 'Wash Pack',
          effectiveUnitValuePaise: 10000,
        },
      }),
    ]),
  );
  assert.match(err ?? '', /Select staff for package redemption/);
});

test('validateBasket still allows normal services without staff', () => {
  const err = validateBasket(
    basket([
      baseLine({
        billableRef: { id: 'svc1', type: 'service' },
        snapshot: {
          name: 'Cut',
          code: null,
          unitSellingPricePaise: 50000,
          gstBps: 1800,
          staffMode: 'SERVICE',
          category: null,
        },
      }),
    ]),
  );
  assert.equal(err, null);
});
