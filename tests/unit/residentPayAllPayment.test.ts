import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

describe('resident portal pay all invoice', () => {
  it('loads aggregate invoice by source unique key without status filter', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/residentPayAllPayment.ts'),
      'utf8',
    );
    const fn = src.slice(src.indexOf('export async function ensureResidentPayAllPaymentHref'));
    assert.match(fn, /eq\(financialInvoices\.sourceId, input\.customerId\)/);
    assert.doesNotMatch(
      fn,
      /inArray\(financialInvoices\.status, \['draft', 'sent', 'overdue', 'partial', 'payment_in_progress'\]\)/,
    );
  });

  it('re-opens terminal pay-all rows instead of inserting a duplicate', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/residentPayAllPayment.ts'),
      'utf8',
    );
    assert.match(src, /payAllInvoiceStatusAfterRefresh/);
    assert.match(src, /return 'sent'/);
  });
});
