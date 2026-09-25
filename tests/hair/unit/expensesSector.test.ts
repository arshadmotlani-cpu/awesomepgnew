import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { validateManualExpenseFields } from '@/src/hair/services/expenses';
import { orgFilter } from '@/src/hair/lib/tenant/filters';
import { fyhExpenses } from '@/src/hair/db/schema';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Expenses sector validation', () => {
  const base = {
    title: 'Tea',
    category: 'general' as const,
    expenseDate: '2026-03-01',
    expenseFor: 'organization' as const,
    paidBy: 'business_cash' as const,
    amountRupees: 100,
    paymentMethod: 'cash' as const,
    staffName: 'Recorder',
  };

  it('rejects zero amount', () => {
    assert.throws(
      () => validateManualExpenseFields({ ...base, amountRupees: 0 }),
      /greater than zero/,
    );
  });

  it('requires staff when paid by staff', () => {
    assert.throws(
      () =>
        validateManualExpenseFields({
          ...base,
          paidBy: 'staff',
          staffEmployeeId: null,
        }),
      /Staff name is required/,
    );
  });

  it('clears staff requirement for business cash', () => {
    validateManualExpenseFields({
      ...base,
      paidBy: 'business_cash',
      staffEmployeeId: null,
    });
  });

  it('rejects salary category on manual create', () => {
    assert.throws(
      () => validateManualExpenseFields({ ...base, category: 'salary' }),
      /payroll/,
    );
  });

  it('rejects staff id when not paid by staff', () => {
    assert.throws(
      () =>
        validateManualExpenseFields({
          ...base,
          paidBy: 'petty_cash',
          staffEmployeeId: '00000000-0000-4000-8000-000000000001',
        }),
      /must be empty/,
    );
  });
});

describe('Expenses permissions wiring', () => {
  it('uses FYH general rights on pages and actions', () => {
    const page = read('app/(hair)/fyh/(app)/expenses/page.tsx');
    assert.match(page, /expenses\.general\.view/);
    assert.match(page, /listGeneralExpenses/);
    const actions = read('src/hair/actions/expenses.ts');
    assert.match(actions, /expenses\.general\.add/);
    assert.match(actions, /expenses\.general\.edit/);
    assert.match(actions, /cancelManualExpense/);
  });

  it('quick actions gate Add Expense on expenses.general.add', () => {
    const menu = read('src/hair/components/HairQuickActionsMenu.tsx');
    assert.match(menu, /canAddGeneralExpense/);
    assert.match(menu, /expense_modal.*canAddGeneralExpense/s);
  });

  it('sub-nav respects general vs salary visibility props', () => {
    const sub = read('src/hair/components/expenses/ExpensesSectionSubNav.tsx');
    assert.match(sub, /showGeneral/);
    assert.match(sub, /showSalary/);
  });
});

describe('Expenses purchase integration', () => {
  it('purchase engine sets source purchase and vendor expense_for', () => {
    const engine = read('src/hair/services/purchaseEngine.ts');
    assert.match(engine, /source: 'purchase'/);
    assert.match(engine, /expenseFor: 'vendor'/);
  });

  it('blocks editing purchase-linked rows in service', () => {
    const svc = read('src/hair/services/expenses.ts');
    assert.match(svc, /Purchase-generated expenses must be edited from Purchases/);
    assert.match(svc, /cannot be cancelled here/);
  });

  it('migration adds purchase_id uniqueness', () => {
    const mig = read('src/hair/db/migrations/0052_expenses_sector.sql');
    assert.match(mig, /fyh_expenses_purchase_id_uidx/);
  });
});

describe('Expenses aggregation SSOT', () => {
  it('excludes salary category from general totals', () => {
    const agg = read('src/hair/services/expenseAggregation.ts');
    assert.match(agg, /ne\(fyhExpenses\.category, 'salary'\)/);
    assert.match(agg, /eq\(fyhExpenses\.status, 'active'\)/);
  });

  it('owner summary uses sumGeneralExpensesPaise', () => {
    const owner = read('src/hair/services/ownerFinancialSummary.ts');
    assert.match(owner, /sumGeneralExpensesPaise/);
    assert.doesNotMatch(owner, /sum\(fyhExpenses\.amountPaise\)/);
  });
});

describe('Expenses tenant scoping', () => {
  it('list and get use org filter', () => {
    const svc = read('src/hair/services/expenses.ts');
    assert.match(svc, /resolveTenantContextForService/);
    assert.match(svc, /orgFilter\(fyhExpenses\.organizationId/);
  });

  it('org filters differ across tenants', () => {
    const ctxA = {
      userId: 'u1',
      organizationId: 'org-a',
      locationId: 'loc-a',
      membershipId: 'm1',
      membershipRole: 'owner' as const,
      allowedLocationIds: ['loc-a'],
      permissions: [] as const,
    };
    const ctxB = { ...ctxA, organizationId: 'org-b', locationId: 'loc-b' };
    const prev = process.env.FYH_SAAS_TENANT;
    process.env.FYH_SAAS_TENANT = '1';
    try {
      assert.notDeepEqual(
        orgFilter(fyhExpenses.organizationId, ctxA),
        orgFilter(fyhExpenses.organizationId, ctxB),
      );
    } finally {
      if (prev === undefined) delete process.env.FYH_SAAS_TENANT;
      else process.env.FYH_SAAS_TENANT = prev;
    }
  });
});
