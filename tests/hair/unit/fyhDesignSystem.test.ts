/**
 * FYHAIR design system + customer workflow regression checks.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('globals.css uses navy/cyan palette and compact control height', () => {
  const css = readFileSync(join(root, 'src/hair/styles/globals.css'), 'utf8');
  assert.match(css, /--fyh-bg-base:\s*#070b14/);
  assert.match(css, /--fyh-accent:\s*#22d3ee/);
  assert.match(css, /--fyh-control-h:\s*2\.375rem/);
  assert.match(css, /\.fyh-modal-overlay/);
  assert.match(css, /\.fyh-customer-context/);
});

test('primary button uses cyan accent not forest green fill', () => {
  const css = readFileSync(join(root, 'src/hair/styles/globals.css'), 'utf8');
  assert.match(css, /\.fyh-btn-primary[\s\S]*background:\s*var\(--fyh-accent\)/);
});

test('FyhCustomerSearch shows create customer affordance', () => {
  const src = readFileSync(
    join(root, 'src/hair/components/booking/FyhCustomerSearch.tsx'),
    'utf8',
  );
  assert.match(src, /Create new customer/);
  assert.match(src, /FyhCustomerCreateModal/);
});

test('createSalonCustomerFromForm allows appointments and quick_sale permissions', () => {
  const src = readFileSync(join(root, 'src/hair/actions/quickSaleCustomer.ts'), 'utf8');
  assert.match(src, /page:quick_sale/);
  assert.match(src, /page:appointments/);
  assert.match(src, /createSalonCustomerFromForm/);
});

test('FyhCustomerContextStrip loads POS context action', () => {
  const src = readFileSync(
    join(root, 'src/hair/components/customers/FyhCustomerContextStrip.tsx'),
    'utf8',
  );
  assert.match(src, /loadCustomerContextForPosAction/);
  assert.match(src, /Last visit/);
});

test('AppointmentCreateModal uses shared customer context strip', () => {
  const src = readFileSync(
    join(root, 'src/hair/components/appointments/AppointmentCreateModal.tsx'),
    'utf8',
  );
  assert.match(src, /FyhCustomerContextStrip/);
  assert.match(src, /fyh-modal-overlay/);
});

test('QuickSaleShell uses shared FyhCustomerSearch', () => {
  const src = readFileSync(join(root, 'src/hair/components/quick-sale/QuickSaleShell.tsx'), 'utf8');
  assert.match(src, /FyhCustomerSearch/);
  assert.match(src, /FyhCustomerContextStrip/);
  assert.doesNotMatch(src, /QuickAddCustomerModal/);
});
