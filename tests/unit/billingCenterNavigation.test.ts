import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  ADMIN_MODULES,
  isModuleActive,
  pathnameToModule,
} from '../../src/lib/admin/navigation';
import { SIDEBAR_MODULE_REGISTRY } from '../../src/lib/admin/sidebarModules';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

test('Billing Center route and sidebar resolve to /admin/billing', () => {
  assert.equal(ADMIN_MODULES.billing.href, '/admin/billing');
  assert.equal(SIDEBAR_MODULE_REGISTRY.billing.href, '/admin/billing');
  assert.equal(SIDEBAR_MODULE_REGISTRY.billing.label, 'Billing Center');
  assert.equal(SIDEBAR_MODULE_REGISTRY.billing.module, 'billing');
  assert.equal(pathnameToModule('/admin/billing'), 'billing');
  assert.equal(pathnameToModule('/admin/billing/electricity/generate'), 'billing');
  assert.equal(isModuleActive('/admin/billing', 'billing'), true);
  assert.equal(isModuleActive('/admin/operations', 'billing'), false);
});

test('Collections and Billing Center are distinct modules', () => {
  assert.equal(pathnameToModule('/admin/collections'), 'collections');
  assert.equal(pathnameToModule('/admin/billing'), 'billing');
  assert.notEqual(
    pathnameToModule('/admin/collections'),
    pathnameToModule('/admin/billing'),
  );
});

test('Billing Center rent card is status-only — no manual Generate Rent button', () => {
  const page = read('app/(admin)/admin/billing/page.tsx');
  const primary = read('src/components/admin/billing/BillingPrimaryActions.tsx');
  const collectionsTools = read('src/components/admin/CollectionsBillingTools.tsx');
  assert.match(page, /BillingPrimaryActions/);
  assert.match(primary, /Rent bills are generated automatically on the 1st of each month/);
  assert.match(primary, /All rent bills generated/);
  assert.match(primary, /need attention/);
  assert.match(primary, /tab=failures/);
  assert.doesNotMatch(primary, /Generate Rent Bills/);
  assert.doesNotMatch(primary, /generateRentBillsAction/);
  assert.doesNotMatch(primary, /GenerateInvoicesButton/);
  assert.doesNotMatch(collectionsTools, /GenerateInvoicesButton/);
  assert.match(primary, /Generate Electricity Bills/);
  assert.match(primary, /\/admin\/billing\/electricity\/generate/);
});

test('automatic rent generation cron and idempotent engine remain intact', () => {
  const cron = read('app/api/cron/generate-monthly-rent/route.ts');
  const rentInvoices = read('src/services/rentInvoices.ts');
  const rentActions = read('app/(admin)/admin/rent/actions.ts');
  assert.match(cron, /runDailyRentBillingJob/);
  assert.match(rentInvoices, /generateRentInvoicesForMonth/);
  assert.match(rentInvoices, /idempotent/i);
  assert.match(rentActions, /generateRentInvoicesForMonth/);
  assert.match(rentActions, /generateRentBillsAction/);
});

test('Billing Center page requires admin session', () => {
  const page = read('app/(admin)/admin/billing/page.tsx');
  assert.match(page, /requireAdminSession\('\/admin\/billing'\)/);
  assert.match(page, /adminHasPermission\(session\.role, 'rent:write'\)/);
});

test('Sidebar clears stuck optimistic Billing Center navigation', () => {
  const sidebar = read('src/components/admin/Sidebar.tsx');
  assert.match(sidebar, /setTimeout/);
  assert.match(sidebar, /setOptimisticHref\(null\)/);
  assert.match(sidebar, /8_000/);
});

test('AdminNavLink is a real Link to Billing Center href', () => {
  const nav = read('src/components/admin/AdminNavLink.tsx');
  const row = read('src/components/admin/sidebar/DraggableSidebarRow.tsx');
  assert.match(nav, /from 'next\/link'/);
  assert.match(nav, /<Link/);
  assert.match(row, /href=\{item\.href\}/);
  assert.match(row, /isModuleActive\(activePath, item\.module\)/);
});
