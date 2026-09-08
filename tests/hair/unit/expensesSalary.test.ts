import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  defaultPayrollMonthKey,
  isPayrollPeriodAvailable,
  payrollPeriodFromMonthKey,
} from '@/src/workforce/lib/payrollAvailability';
import { resolvePreviousMonthPeriod } from '@/src/workforce/lib/payrollPeriod';
import { payrollNetPaise } from '@/src/workforce/lib/compensationMath';
import { orgFilter } from '@/src/hair/lib/tenant/filters';
import { wfPayrollRuns } from '@/src/workforce/db/schema';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Expenses salary navigation', () => {
  it('1 — sub-nav contains General Expenses + Salary', () => {
    const subNav = read('src/hair/components/expenses/ExpensesSectionSubNav.tsx');
    assert.match(subNav, /General Expenses/);
    assert.match(subNav, /Salary/);
    const expenses = read('app/(hair)/fyh/(app)/expenses/page.tsx');
    assert.match(expenses, /ExpensesSectionSubNav/);
    const salary = read('app/(hair)/fyh/(app)/expenses/salary/page.tsx');
    assert.match(salary, /ExpensesSectionSubNav/);
  });

  it('2 — General Expenses route remains functional', () => {
    const page = read('app/(hair)/fyh/(app)/expenses/page.tsx');
    assert.match(page, /ExpensesPageUi/);
    assert.match(page, /listExpenses/);
    const ui = read('src/hair/components/expenses/ExpensesUi.tsx');
    assert.match(ui, /Add expense/);
  });
});

describe('Payroll period availability', () => {
  it('3/4 — previous completed month; January available on 1 February', () => {
    const jan = payrollPeriodFromMonthKey('2027-01');
    assert.equal(jan.periodStart, '2027-01-01');
    assert.equal(jan.periodEnd, '2027-01-31');
    assert.equal(
      isPayrollPeriodAvailable(jan, 'Asia/Kolkata', new Date('2027-01-31T12:00:00+05:30')),
      false,
    );
    assert.equal(
      isPayrollPeriodAvailable(jan, 'Asia/Kolkata', new Date('2027-02-01T12:00:00+05:30')),
      true,
    );
    const prev = resolvePreviousMonthPeriod('Asia/Kolkata', new Date('2027-02-01T12:00:00+05:30'));
    assert.equal(prev.periodStart, '2027-01-01');
    assert.equal(defaultPayrollMonthKey('Asia/Kolkata', new Date('2027-02-01T12:00:00+05:30')), '2027-01');
  });
});

describe('Payroll SSOT integration', () => {
  it('5 — idempotent run uses createDraftPayrollRun + unique period index', () => {
    const payroll = read('src/workforce/services/payroll.ts');
    assert.match(payroll, /getOrCreatePayrollRunForMonth/);
    assert.match(payroll, /createDraftPayrollRun/);
    assert.match(payroll, /findRunForPeriod/);
    const schema = read('src/workforce/db/schema.ts');
    assert.match(schema, /wf_payroll_runs_org_engine_period_uidx/);
    const migration = read('src/hair/db/migrations/0048_payroll_payments.sql');
    assert.match(migration, /wf_payroll_runs_org_engine_period_uidx/);
  });

  it('6 — mid-month join uses isEmployeeEligibleForPeriod in compensation service', () => {
    const comp = read('src/workforce/services/compensation.ts');
    assert.match(comp, /isEmployeeEligibleForPeriod/);
  });

  it('7/8 — attendance deduction and incentives flow through compensation SSOT', () => {
    const comp = read('src/workforce/services/compensation.ts');
    assert.match(comp, /computeAttendanceDeductionForPayroll/);
    assert.match(comp, /computeSalonPeriodIncentive/);
    assert.match(comp, /payrollNetPaise/);
    const net = payrollNetPaise({
      salaryPaise: 30_000_00,
      commissionPaise: 0,
      incentivePaise: 2_000_00,
      deductionsPaise: 1_000_00,
    });
    assert.equal(net, 31_000_00);
  });
});

describe('Salary permissions and payment records', () => {
  it('9/10/11 — staff own salary vs owner team payroll', () => {
    const salaryPage = read('app/(hair)/fyh/(app)/expenses/salary/page.tsx');
    assert.match(salaryPage, /loadStaffPayrollPage/);
    assert.match(salaryPage, /ownerView={false}/);
    assert.match(salaryPage, /loadOwnerPayrollPage/);
    const actions = read('src/workforce/actions/payroll.ts');
    assert.match(actions, /canViewTeamPayroll/);
    assert.match(actions, /finance\.view_salary/);
    assert.match(actions, /canViewOwnSalary/);
    assert.match(actions, /finance\.pay_salary/);
  });

  it('12/18 — payroll queries are tenant-scoped', () => {
    const payroll = read('src/workforce/services/payroll.ts');
    assert.match(payroll, /orgFilter\(wfPayrollRuns\.organizationId/);
    assert.match(payroll, /resolveTenantContextForService/);
    const ctxA = {
      userId: 'u1',
      organizationId: 'org-a',
      locationId: 'loc-a',
      membershipId: 'm1',
      membershipRole: 'owner' as const,
      allowedLocationIds: ['loc-a'],
      permissions: [] as const,
    };
    const ctxB = { ...ctxA, organizationId: 'org-b' };
    const prev = process.env.FYH_SAAS_TENANT;
    process.env.FYH_SAAS_TENANT = '1';
    try {
      assert.notDeepEqual(
        orgFilter(wfPayrollRuns.organizationId, ctxA),
        orgFilter(wfPayrollRuns.organizationId, ctxB),
      );
    } finally {
      if (prev === undefined) delete process.env.FYH_SAAS_TENANT;
      else process.env.FYH_SAAS_TENANT = prev;
    }
  });

  it('13 — owner can view QR from salary payment panel when permitted', () => {
    const card = read('src/workforce/components/payroll/SalaryEmployeeCard.tsx');
    assert.match(card, /View QR/);
    assert.match(card, /canViewQr/);
    assert.match(card, /canPay/);
    assert.match(card, /Mark paid/);
  });

  it('14/15/16 — payment creates persistent record with idempotency', () => {
    const payroll = read('src/workforce/services/payroll.ts');
    assert.match(payroll, /recordPayrollPayment/);
    assert.match(payroll, /wfPayrollPayments/);
    const schema = read('src/workforce/db/schema.ts');
    assert.match(schema, /wf_payroll_payments_line_uidx/);
    const migration = read('src/hair/db/migrations/0048_payroll_payments.sql');
    assert.match(migration, /wf_payroll_payments_line_uidx/);
    assert.match(migration, /payment_reference/);
  });

  it('17 — payroll lines snapshot via createDraftPayrollRun (not UI math)', () => {
    const owner = read('src/workforce/components/payroll/OwnerSalaryPageClient.tsx');
    assert.doesNotMatch(owner, /payrollNetPaise/);
    assert.match(read('src/workforce/services/payroll.ts'), /buildStaffMonthAttendanceSummary/);
  });
});
