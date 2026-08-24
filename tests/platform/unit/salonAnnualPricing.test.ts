import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  STANDARD_SALON_LIST_PRICE_PAISE,
  STANDARD_SALON_PRICE_PAISE,
  customSalonAnnualPlanLimits,
  isOrganizationCustomPlanSlug,
  organizationCustomPlanSlug,
  resolveListPricePaiseFromPlanLimits,
  standardSalonPlanLimits,
} from '@/src/platform/lib/salonSubscriptionPricing';
import {
  computeSubscriptionPeriod,
  resolveAmountPaiseFromPlanLimits,
  resolveBillingIntervalFromPlanLimits,
} from '@/src/platform/services/manualSubscriptionPayments';

test('standard salon limits resolve to ₹6,500/year charge', () => {
  const limits = standardSalonPlanLimits({ locations: 1 });
  assert.equal(resolveAmountPaiseFromPlanLimits(limits), STANDARD_SALON_PRICE_PAISE);
  assert.equal(resolveListPricePaiseFromPlanLimits(limits), STANDARD_SALON_LIST_PRICE_PAISE);
  assert.equal(resolveBillingIntervalFromPlanLimits(limits), 'year');
});

test('custom plan amount is not overridden by standard catalog constants', () => {
  const custom = { amountPaise: 2_500_000, billingInterval: 'month' };
  assert.equal(resolveAmountPaiseFromPlanLimits(custom), 2_500_000);
  assert.equal(resolveBillingIntervalFromPlanLimits(custom), 'month');
  assert.notEqual(resolveAmountPaiseFromPlanLimits(custom), STANDARD_SALON_PRICE_PAISE);
});

test('year billing interval produces a 1-year active period', () => {
  const from = new Date('2026-08-24T07:00:00.000Z');
  const period = computeSubscriptionPeriod('year', from);
  assert.equal(period.periodEnd.getUTCFullYear(), 2027);
  assert.equal(period.periodEnd.getUTCMonth(), from.getUTCMonth());
  assert.equal(period.periodEnd.getUTCDate(), from.getUTCDate());
});

test('landing and subscribe surfaces show list + sale pricing', () => {
  const landing = readFileSync(
    join(process.cwd(), 'src/hair/components/marketing/SalonSoftwareLanding.tsx'),
    'utf8',
  );
  assert.match(landing, /STANDARD_SALON_LIST_PRICE_PAISE/);
  assert.match(landing, /STANDARD_SALON_PRICE_PAISE/);
  assert.match(landing, /line-through/);
  assert.match(landing, /SAVE/);
  // Hero (above the fold) must show struck list price, not sale-only copy
  const heroSlice = landing.slice(0, landing.indexOf('id="pricing"'));
  assert.match(heroSlice, /line-through/);
  assert.match(heroSlice, /STANDARD_SALON_LIST_PRICE_PAISE/);

  const subscribe = readFileSync(
    join(process.cwd(), 'app/(hair)/fyh/(public)/subscribe/page.tsx'),
    'utf8',
  );
  assert.match(subscribe, /listPricePaise/);
  assert.match(subscribe, /line-through/);
  assert.match(subscribe, /Limited-time price/);
});

test('custom annual plan limits stamp exclusive amount without hardcoding in submit', () => {
  const limits = customSalonAnnualPlanLimits(5_000, { locations: 2 });
  assert.equal(limits.amountPaise, 500_000);
  assert.equal(limits.billingInterval, 'year');
  assert.equal(limits.locations, 2);
  const slug = organizationCustomPlanSlug('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  assert.equal(isOrganizationCustomPlanSlug(slug), true);
  assert.equal(isOrganizationCustomPlanSlug('fyhair-production'), false);
});

test('submit path still stamps amount from plan limits (not hardcoded rupees)', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/platform/services/manualSubscriptionPayments.ts'),
    'utf8',
  );
  assert.match(src, /resolveAmountPaiseFromPlanLimits/);
  assert.doesNotMatch(src, /650_000|650000/);
});

test('org admin detail exposes custom annual price form', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/(platform)/platform/admin/organizations/[id]/page.tsx'),
    'utf8',
  );
  assert.match(src, /setCustomAnnualPriceAction/);
  assert.match(src, /yearlyRupees/);
  assert.match(src, /Custom annual price/);
});
