import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOutstandingFromSsotForAudit } from '../../src/services/revenueCommandCenter';

test('buildOutstandingFromSsotForAudit does not add pending proof amounts to total outstanding', () => {
  const portfolio = {
    pendingRentInvoiceCount: 2,
    pendingElectricityInvoiceCount: 1,
    rent: { outstandingPaise: 15_000 },
    electricity: { outstandingPaise: 4_000 },
    deposit: { outstandingPaise: 0 },
    totals: { outstandingPaise: 19_000 },
  };
  const pendingPayments = [{ amountPaise: 3_000 }, { amountPaise: 2_000 }];

  const result = buildOutstandingFromSsotForAudit(portfolio, pendingPayments);

  assert.equal(result.totalOutstandingPaise, 19_000);
  assert.equal(result.pendingPaymentApprovalsPaise, 5_000);
  assert.notEqual(
    result.totalOutstandingPaise,
    portfolio.totals.outstandingPaise + result.pendingPaymentApprovalsPaise,
  );
});
