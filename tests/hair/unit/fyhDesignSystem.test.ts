/**
 * FYHAIR design system + customer workflow regression checks.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('globals.css defines three-level surfaces and input tokens', () => {
  const css = readFileSync(join(root, 'src/hair/styles/globals.css'), 'utf8');
  assert.match(css, /--fyh-bg-content:/);
  assert.match(css, /--fyh-bg-panel:/);
  assert.match(css, /--fyh-bg-panel-muted:/);
  assert.match(css, /--fyh-text-on-panel:/);
  assert.match(css, /--fyh-input-bg:\s*#0b1220/);
  assert.match(css, /--fyh-input-placeholder:\s*#aebbcd/);
  assert.match(css, /\.fyh-panel-financial/);
  assert.match(css, /\.fyh-basket-row/);
  assert.match(css, /\.fyh-panel-muted/);
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
  assert.match(src, /Add customer/);
  assert.match(src, /FyhCustomerCreateModal/);
  assert.match(src, /fyh-picker-dropdown/);
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
  assert.match(src, /fyh-customer-context/);
});

test('AppointmentCreateModal uses elevated panel surfaces', () => {
  const src = readFileSync(
    join(root, 'src/hair/components/appointments/AppointmentCreateModal.tsx'),
    'utf8',
  );
  assert.match(src, /FyhCustomerContextStrip/);
  assert.match(src, /fyh-panel-financial/);
  assert.match(src, /fyh-basket-row/);
  assert.match(src, /fyh-panel-muted/);
  assert.match(src, /fyh-picker-dropdown/);
  assert.match(src, /variant="primary"/);
  assert.doesNotMatch(src, /fyh-card !p-3/);
  assert.doesNotMatch(src, /Chair/);
  assert.doesNotMatch(src, /resourceId/);
});

test('globals.css defines bounded picker dropdown scroll', () => {
  const css = readFileSync(join(root, 'src/hair/styles/globals.css'), 'utf8');
  assert.match(css, /\.fyh-picker-dropdown[\s\S]*max-height/);
  assert.match(css, /\.fyh-picker-dropdown[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.fyh-modal-panel[\s\S]*overflow:\s*hidden/);
  assert.match(css, /\.fyh-booking-modal[\s\S]*max-height/);
});

test('QuickSaleShell uses shared FyhCustomerSearch', () => {
  const src = readFileSync(join(root, 'src/hair/components/quick-sale/QuickSaleShell.tsx'), 'utf8');
  assert.match(src, /FyhCustomerSearch/);
  assert.match(src, /FyhCustomerContextStrip/);
  assert.match(src, /fyh-panel-financial/);
  assert.doesNotMatch(src, /QuickAddCustomerModal/);
});

test('scheduler time labels use semibold weight', () => {
  const css = readFileSync(join(root, 'src/hair/styles/globals.css'), 'utf8');
  assert.match(css, /\.fyh-scheduler-time-label[\s\S]*font-weight:\s*700/);
  assert.match(css, /\.fyh-scheduler-staff-label[\s\S]*font-weight:\s*700/);
});
