import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isSettlementRentInvoice,
  sumSettlementRentPaidPaise,
} from '../../src/lib/billing/settlementRentInvoiceFilter';

test('isSettlementRentInvoice excludes cancelled and synthetic OPTV rows', () => {
  assert.equal(
    isSettlementRentInvoice({
      status: 'paid',
      billingMonth: '2026-07-01',
      invoiceNumber: 'RNT-2026-07-0019',
      paidPrincipalPaise: 412_080,
    }),
    true,
  );
  assert.equal(
    isSettlementRentInvoice({
      status: 'cancelled',
      billingMonth: '2026-07-01',
      invoiceNumber: 'RNT-2026-07-0019',
      paidPrincipalPaise: 412_080,
    }),
    false,
  );
  assert.equal(
    isSettlementRentInvoice({
      status: 'paid',
      billingMonth: '2099-01-01',
      invoiceNumber: 'OPTV-OPTVERIFY_test',
      paidPrincipalPaise: 10_000,
      isAdhoc: true,
    }),
    false,
  );
});

test('sumSettlementRentPaidPaise ignores synthetic pollution', () => {
  const total = sumSettlementRentPaidPaise([
    {
      status: 'paid',
      billingMonth: '2026-07-01',
      invoiceNumber: 'RNT-2026-07-0019',
      paidPrincipalPaise: 412_080,
    },
    {
      status: 'paid',
      billingMonth: '2099-01-01',
      invoiceNumber: 'OPTV-OPTVERIFY_test',
      paidPrincipalPaise: 10_000,
      isAdhoc: true,
    },
  ]);
  assert.equal(total, 412_080);
});
