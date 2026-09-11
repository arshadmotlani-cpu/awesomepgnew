import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  discountBpsFromWholePercent,
  parseWholeDiscountPercent,
  wholeDiscountPercentFromBps,
} from '@/src/hair/lib/quickSaleDiscountPercent';
import { priceBasket } from '@/src/hair/domain/basket/engine';
import type { Basket } from '@/src/hair/domain/basket/types';
import { discountPaiseFromBps } from '@/src/hair/lib/attributionMath';

const root = process.cwd();
function readSrc(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('10 discount accepts whole-number percentages including 0', () => {
  assert.equal(parseWholeDiscountPercent('0'), 0);
  assert.equal(parseWholeDiscountPercent('1'), 1);
  assert.equal(parseWholeDiscountPercent('10'), 10);
  assert.equal(parseWholeDiscountPercent('100'), 100);
});

test('11 decimal discount is rejected', () => {
  assert.equal(parseWholeDiscountPercent('1.5'), null);
  assert.equal(parseWholeDiscountPercent('2.75'), null);
  assert.equal(parseWholeDiscountPercent('10.25'), null);
  assert.equal(parseWholeDiscountPercent('10%'), null);
});

test('12 discount cannot exceed 100%', () => {
  assert.equal(parseWholeDiscountPercent('101'), null);
  assert.equal(parseWholeDiscountPercent('999'), null);
  assert.equal(discountBpsFromWholePercent(100), 10_000);
  assert.equal(wholeDiscountPercentFromBps(10_000), 100);
});

test('13 existing basket pricing unchanged for whole-number discount path', () => {
  const catalogGross = 100_000;
  const bps = discountBpsFromWholePercent(10);
  const discountPaise = discountPaiseFromBps(catalogGross, bps);
  assert.equal(discountPaise, 10_000);
  const basket: Basket = {
    customerId: 'c1',
    payments: [],
    flags: {},
    lines: [
      {
        lineId: 'l1',
        billableRef: { id: 's1', type: 'service' },
        snapshot: {
          name: 'Cut',
          code: null,
          unitSellingPricePaise: 100_000,
          gstBps: 1800,
          staffMode: 'SERVICE',
          category: null,
        },
        quantity: 1,
        overridePricePaise: catalogGross - discountPaise,
        staff: [{ staffId: 'st1', shareBps: 10_000 }],
      },
    ],
  };
  const priced = priceBasket(basket);
  assert.equal(priced.lines[0]!.discountBps, 1000);
  assert.equal(priced.lines[0]!.finalLinePaise, 90_000);
});

test('14 package redemption remains ₹0', () => {
  const basket: Basket = {
    customerId: 'c1',
    payments: [],
    flags: {},
    lines: [
      {
        lineId: 'r1',
        billableRef: { id: 'svc1', type: 'service' },
        snapshot: {
          name: 'Hair Wash',
          code: null,
          unitSellingPricePaise: 20_000,
          gstBps: 1800,
          staffMode: 'SERVICE',
          category: 'Package Redemption',
        },
        quantity: 1,
        overridePricePaise: 0,
        staff: [{ staffId: 'st1', shareBps: 10_000 }],
        prepaidRedemption: {
          kind: 'package_redemption',
          customerPackageId: 'cp1',
          creditId: 'cr1',
          serviceId: 'svc1',
          packageName: 'Wash Pack',
          effectiveUnitValuePaise: 10_000,
          retailUnitValuePaise: 20_000,
        },
      },
    ],
  };
  const priced = priceBasket(basket);
  assert.equal(priced.totals.grandTotalPaise, 0);
});

test('15–16 package performance uses effective value; normal service unchanged', () => {
  const redeem: Basket = {
    customerId: 'c1',
    payments: [],
    flags: {},
    lines: [
      {
        lineId: 'r1',
        billableRef: { id: 'svc1', type: 'service' },
        snapshot: {
          name: 'Hair Wash',
          code: null,
          unitSellingPricePaise: 55_000,
          gstBps: 1800,
          staffMode: 'SERVICE',
          category: 'Package Redemption',
        },
        quantity: 1,
        overridePricePaise: 0,
        staff: [{ staffId: 'st1', shareBps: 10_000 }],
        prepaidRedemption: {
          kind: 'package_redemption',
          customerPackageId: 'cp1',
          creditId: 'cr1',
          serviceId: 'svc1',
          packageName: 'Premium',
          effectiveUnitValuePaise: 27_500,
          retailUnitValuePaise: 55_000,
        },
      },
    ],
  };
  const redeemPriced = priceBasket(redeem);
  assert.equal(redeemPriced.attributions[0]!.attributedBasePaise, 27_500);

  const normal: Basket = {
    customerId: 'c1',
    payments: [],
    flags: {},
    lines: [
      {
        lineId: 's1',
        billableRef: { id: 'svc1', type: 'service' },
        snapshot: {
          name: 'Hair Wash',
          code: null,
          unitSellingPricePaise: 55_000,
          gstBps: 1800,
          staffMode: 'SERVICE',
          category: null,
        },
        quantity: 1,
        overridePricePaise: null,
        staff: [{ staffId: 'st1', shareBps: 10_000 }],
      },
    ],
  };
  const normalPriced = priceBasket(normal);
  assert.ok(normalPriced.attributions[0]!.attributedBasePaise > 0);
  assert.notEqual(normalPriced.attributions[0]!.attributedBasePaise, 27_500);
});

test('1–9 staff dropdown architecture: portal, close, keyboard, no left/right nav', () => {
  const staff = readSrc('src/hair/components/quick-sale/QuickSaleStaffFields.tsx');
  assert.match(staff, /createPortal/);
  assert.match(staff, /document\.body/);
  assert.match(staff, /z-\[700\]/);
  assert.match(staff, /data-testid="qs-staff-dropdown"/);
  assert.match(staff, /Escape/);
  assert.match(staff, /mousedown/);
  assert.match(staff, /ArrowDown/);
  assert.match(staff, /ArrowUp/);
  assert.match(staff, /ArrowLeft/);
  assert.match(staff, /do not change highlighted staff/i);
  assert.match(staff, /closeDropdown/);
  assert.match(staff, /suppressOpenRef/);
});

test('payment panel exposes POS allocation summary and due action', () => {
  const panel = readSrc('src/hair/components/quick-sale/QuickSalePaymentPanel.tsx');
  const shell = readSrc('src/hair/components/quick-sale/QuickSaleShell.tsx');
  assert.match(panel, /Remaining to allocate/i);
  assert.match(panel, /Mark .* as Due/);
  assert.match(panel, /\+ Add Payment/);
  assert.match(panel, /Payments received/);
  assert.match(shell, /Complete Sale/);
  assert.match(shell, /canCompleteSale/);
});

test('POS shell uses compact viewport layout and basket-only scroll', () => {
  const shell = readSrc('src/hair/components/quick-sale/QuickSaleShell.tsx');
  const css = readSrc('src/hair/styles/globals.css');
  const basket = readSrc('src/hair/components/quick-sale/QuickSaleBasketTable.tsx');
  assert.match(shell, /qs-pos-shell/);
  assert.match(shell, /qs-basket-section/);
  assert.match(shell, /qs-customer-bar/);
  assert.match(css, /\.qs-pos-shell/);
  assert.match(css, /\.qs-basket-scroll/);
  assert.match(basket, /qs-basket-scroll/);
  assert.match(basket, /QuickSaleDiscountPercentInput/);
});
