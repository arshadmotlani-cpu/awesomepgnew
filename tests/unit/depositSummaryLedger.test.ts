import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardDepositPaise, guardPlainPaise } from '@/src/lib/deposits/paiseSafety';
import { coerceNonNegativePaise } from '@/src/lib/format';
import { isDepositCollectionAdjustmentReason } from '@/src/lib/deposits/constants';

/** Mirrors getDepositSummaryForBooking aggregation — regression for signed ledger rows. */
function summarizeLedger(
  entries: Array<{ entryKind: string; amountPaise: number; reason: string }>,
) {
  let collected = 0;
  let ledgerDeducted = 0;
  let refunded = 0;
  let residentDeducted = 0;
  let ledgerBalance = 0;

  for (const e of entries) {
    const amount = guardPlainPaise(e.amountPaise);
    ledgerBalance += amount;
    if (e.entryKind === 'collected') collected += coerceNonNegativePaise(amount);
    else if (e.entryKind === 'deducted') {
      const abs = coerceNonNegativePaise(-amount);
      ledgerDeducted += abs;
      if (!isDepositCollectionAdjustmentReason(e.reason)) {
        residentDeducted += abs;
      }
    } else if (e.entryKind === 'refunded') refunded += coerceNonNegativePaise(-amount);
  }

  return {
    collectedPaise: collected,
    deductedPaise: residentDeducted,
    ledgerDeductedPaise: ledgerDeducted,
    refundedPaise: refunded,
    refundableBalancePaise: guardDepositPaise(Math.max(0, ledgerBalance)),
  };
}

test('APG-2026-0032: transfer deductions with negative amounts net refundable to zero', () => {
  const summary = summarizeLedger([
    {
      entryKind: 'collected',
      amountPaise: 33_000,
      reason: 'Express Collection',
    },
    {
      entryKind: 'deducted',
      amountPaise: -33_000,
      reason: 'Deposit credit transferred to booking target',
    },
    {
      entryKind: 'collected',
      amountPaise: 16_500,
      reason: 'Prior stay balance collected with new booking checkout',
    },
    {
      entryKind: 'deducted',
      amountPaise: -16_500,
      reason: 'Deposit credit transferred to booking target',
    },
  ]);

  assert.equal(summary.collectedPaise, 49_500);
  assert.equal(summary.ledgerDeductedPaise, 49_500);
  assert.equal(summary.refundableBalancePaise, 0);
});

test('guardDepositPaise must not be used on deducted ledger amounts', () => {
  assert.equal(guardDepositPaise(-33_000), 0);
  assert.equal(guardPlainPaise(-33_000), -33_000);
});
