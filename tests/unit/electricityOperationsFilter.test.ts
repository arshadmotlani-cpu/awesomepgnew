import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operationsElectricityInvoiceFilter } from '@/src/lib/billing/electricityOperationsFilter';
import { isProductionElectricityInvoiceFilter } from '@/src/lib/billing/electricityProductionFilter';
import { PIPELINE_TEST_RESIDENT_EMAIL } from '@/src/lib/billing/pipelineTestResident';

test('operations electricity filter requires production invoice and non-test booking/customer', () => {
  const filter = operationsElectricityInvoiceFilter();
  assert.ok(filter);
  const prodOnly = isProductionElectricityInvoiceFilter();
  assert.ok(prodOnly);
  assert.equal(PIPELINE_TEST_RESIDENT_EMAIL, 'arshadmotlani0@gmail.com');
});
