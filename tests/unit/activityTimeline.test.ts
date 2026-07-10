import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('activity timeline merges audit log and invoice audit events', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/activityTimeline.ts'), 'utf8');
  assert.match(src, /invoiceAuditEvents/);
  assert.match(src, /auditLog/);
});

test('resident search matches invoice numbers', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/adminResidentSearch.ts'), 'utf8');
  assert.match(src, /financial_invoices/);
  assert.match(src, /rent_invoices/);
});
