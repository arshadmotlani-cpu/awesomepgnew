import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  approveDuplicateConfirmMessage,
  assertTransactionRefRequired,
  buildDuplicateFlags,
  labelDuplicateContext,
  normalizeTransactionRef,
} from '@/src/lib/payments/transactionRefDuplicate';
import {
  computeSubscriptionPeriod,
  resolveAmountPaiseFromPlanLimits,
  resolveBillingIntervalFromPlanLimits,
} from '@/src/platform/services/manualSubscriptionPayments';

const root = process.cwd();

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('normalizeTransactionRef mirrors shared helper cases', () => {
  assert.equal(normalizeTransactionRef('  AbC123  '), 'abc123');
  assert.equal(normalizeTransactionRef(''), null);
  assert.equal(normalizeTransactionRef('   '), null);
  assert.equal(normalizeTransactionRef(null), null);
});

test('assertTransactionRefRequired + buildDuplicateFlags', () => {
  assert.equal(assertTransactionRefRequired(' TXN-9 '), 'txn-9');
  assert.throws(() => assertTransactionRefRequired(''), /required/i);
  assert.deepEqual(buildDuplicateFlags([]), {
    possibleDuplicate: false,
    duplicateOfIds: [],
  });
  assert.deepEqual(
    buildDuplicateFlags([
      { id: 'a', status: 'pending' },
      { id: 'b', status: 'approved' },
    ]),
    { possibleDuplicate: true, duplicateOfIds: ['a', 'b'] },
  );
});

test('labelDuplicateContext prefers approved sibling for reject note', () => {
  const label = labelDuplicateContext({ id: 'new', status: 'pending' }, [
    { id: 'pend-1', status: 'pending' },
    { id: 'appr-99abcdef', status: 'approved' },
  ]);
  assert.equal(label.isDuplicate, true);
  assert.equal(label.badge, 'Duplicate reference ID');
  assert.match(label.defaultRejectNote ?? '', /Duplicate of approved payment #appr-99a/i);
  assert.match(
    approveDuplicateConfirmMessage({
      id: 'sib',
      status: 'approved',
      organizationId: 'org-12345678xxxx',
      reviewedAt: '2026-08-01T00:00:00.000Z',
    }),
    /org-1234/i,
  );
});

test('billing interval + period from plan limits', () => {
  assert.equal(resolveBillingIntervalFromPlanLimits({}), 'month');
  assert.equal(resolveBillingIntervalFromPlanLimits({ billingInterval: 'year' }), 'year');
  assert.equal(resolveBillingIntervalFromPlanLimits({ billing_interval: 'yearly' }), 'year');

  const from = new Date('2026-08-15T00:00:00.000Z');
  const month = computeSubscriptionPeriod('month', from);
  assert.equal(month.periodEnd.getUTCMonth(), 8); // Sep (0-indexed)
  const year = computeSubscriptionPeriod('year', from);
  assert.equal(year.periodEnd.getUTCFullYear(), 2027);
});

test('resolveAmountPaiseFromPlanLimits prefers amountPaise over priceYearly', () => {
  assert.equal(
    resolveAmountPaiseFromPlanLimits({ amountPaise: 650_000, priceYearly: 15000 }),
    650_000,
  );
  assert.equal(resolveAmountPaiseFromPlanLimits({ priceYearly: 6500 }), 650_000);
});

test('subscribe action does not import Stripe checkout', () => {
  const code = stripComments(
    readFileSync(join(root, 'src/hair/actions/subscribe.ts'), 'utf8'),
  );
  assert.equal(/\bcreateCheckoutSession\b/.test(code), false);
  assert.equal(/billing\/stripe/.test(code), false);
  assert.equal(/\bfrom\s+['"]stripe['"]/.test(code), false);
  assert.ok(/\bsubmitSubscriptionPayment\b/.test(code));
  assert.ok(/\bsubmitManualSubscribePaymentAction\b/.test(code));
});
