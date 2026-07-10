import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('SimpleInvoiceCard renders invoice detail link when detailHref is set', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/components/customer/simple/SimpleInvoiceCard.tsx'),
    'utf8',
  );
  assert.match(src, /invoice\.detailHref/);
  assert.match(src, /View invoice/);
});

test('residentAccountContext maps RFE line items for open bills', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/residentAccountContext.ts'), 'utf8');
  assert.match(src, /buildRfeLineItemMap/);
  assert.match(src, /rfeLineItems\.get/);
});

test('admin open rent invoices use RFE projection helper', () => {
  const src = readFileSync(join(process.cwd(), 'src/db/queries/admin.ts'), 'utf8');
  assert.match(src, /projectRentInvoiceAdminView/);
});
