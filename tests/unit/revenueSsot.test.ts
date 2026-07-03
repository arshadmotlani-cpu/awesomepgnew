import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOutstandingFromSsotForAudit } from '../../src/services/revenueCommandCenter';

test('buildOutstandingFromSsotForAudit does not add pending proof amounts to total outstanding', () => {
  const invoices = {
    pendingRentInvoices: 2,
    pendingElectricityInvoices: 1,
    pendingRentInvoicesPaise: 15_000,
    pendingElectricityInvoicesPaise: 4_000,
    totalOutstandingPaise: 19_000,
  };
  const pendingPayments = [{ amountPaise: 3_000 }, { amountPaise: 2_000 }];

  const result = buildOutstandingFromSsotForAudit(invoices, pendingPayments);

  assert.equal(result.totalOutstandingPaise, 19_000);
  assert.equal(result.pendingPaymentApprovalsPaise, 5_000);
  assert.notEqual(
    result.totalOutstandingPaise,
    invoices.totalOutstandingPaise + result.pendingPaymentApprovalsPaise,
  );
});
