import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { HAIR_NAV_ENTRIES } from '@/src/hair/lib/nav';
import {
  invoiceRegisterTodayIso,
  shouldDefaultInvoiceRegisterToToday,
} from '@/src/hair/services/invoiceRegisterQueries';
import { testCustomerWhere, testProductWhere } from '@/src/hair/lib/testArtifactPatterns';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

function findGroup(id: string) {
  const group = HAIR_NAV_ENTRIES.find((e) => e.type === 'group' && e.id === id);
  assert.ok(group && group.type === 'group');
  return group;
}

describe('SOFT salon admin navigation cleanup', () => {
  it('hides Inventory and Vendors from primary navigation', () => {
    const topLevel = HAIR_NAV_ENTRIES.filter((e) => e.type === 'link' && !e.hidden);
    const labels = topLevel.map((e) => (e.type === 'link' ? e.label : ''));
    assert.equal(labels.includes('Inventory'), false);
    assert.equal(labels.includes('Vendors'), false);
    assert.ok(labels.includes('Purchases'));
    assert.ok(labels.includes('Expenses'));
  });

  it('exposes Services, Products, Memberships, and Packages under Configuration', () => {
    const configuration = findGroup('configuration');
    assert.deepEqual(configuration.children.map((c) => c.label), [
      'Services',
      'Products',
      'Memberships',
      'Packages',
    ]);
    assert.deepEqual(configuration.children.map((c) => c.href), [
      '/services',
      '/products',
      '/memberships',
      '/packages',
    ]);
  });
});

describe('invoice register defaults to today', () => {
  it('redirects when no date filter is present', () => {
    assert.equal(shouldDefaultInvoiceRegisterToToday({}), true);
    assert.equal(shouldDefaultInvoiceRegisterToToday({ page: '2' }), true);
    assert.equal(shouldDefaultInvoiceRegisterToToday({ from: '2026-08-30' }), false);
    assert.equal(shouldDefaultInvoiceRegisterToToday({ all: '1' }), false);
  });

  it('uses salon-local today key', () => {
    assert.match(invoiceRegisterTodayIso('Asia/Kolkata'), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('integration test artifact patterns', () => {
  it('matches RC customers and Inv Ops products', () => {
    assert.match(testCustomerWhere(), /RC Customer %/);
    assert.match(testProductWhere(), /Inv Ops %/);
  });
});

describe('Purchases and Expenses pages use tenant context', () => {
  it('loads purchases with tenant context on list and detail routes', () => {
    const list = read('app/(hair)/fyh/(app)/purchases/page.tsx');
    const detail = read('app/(hair)/fyh/(app)/purchases/[id]/page.tsx');
    assert.match(list, /getTenantContextForPage/);
    assert.match(list, /listPurchases\(200, ctx\)/);
    assert.match(detail, /getPurchase\(id, ctx\)/);
  });

  it('loads expenses with tenant context', () => {
    const page = read('app/(hair)/fyh/(app)/expenses/page.tsx');
    assert.match(page, /getTenantContextForPage/);
    assert.match(page, /listExpenses\(200, ctx\)/);
  });
});
