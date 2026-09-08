import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { WORKFORCE_ADDITIONAL_RIGHTS } from '@/src/workforce/permissions/additionalRights';
import { permissionDef } from '@/src/workforce/permissions/library';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import { hasWorkforcePermission } from '@/src/workforce/permissions/resolve';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Payroll RBAC defaults', () => {
  it('staff template has no team salary or payroll rights', () => {
    const staff = codeTemplateForAccessRole('staff');
    assert.equal(hasWorkforcePermission(staff, 'finance.view_salary'), false);
    assert.equal(hasWorkforcePermission(staff, 'finance.manage_salary'), false);
    assert.equal(hasWorkforcePermission(staff, 'finance.pay_salary'), false);
    assert.equal(hasWorkforcePermission(staff, 'finance.view_own_salary'), false);
    assert.equal(hasWorkforcePermission(staff, 'attendance.view_team'), false);
  });

  it('manager template excludes owner-only salary and attendance rights', () => {
    const manager = codeTemplateForAccessRole('manager');
    assert.equal(hasWorkforcePermission(manager, 'finance.view_salary'), false);
    assert.equal(hasWorkforcePermission(manager, 'finance.pay_salary'), false);
    assert.equal(hasWorkforcePermission(manager, 'attendance.view_team'), false);
    assert.equal(hasWorkforcePermission(manager, 'attendance.correct'), false);
  });

  it('owner template includes granular salary permissions', () => {
    const owner = codeTemplateForAccessRole('owner');
    assert.ok(hasWorkforcePermission(owner, 'finance.view_salary'));
    assert.ok(hasWorkforcePermission(owner, 'finance.manage_salary'));
    assert.ok(hasWorkforcePermission(owner, 'finance.pay_salary'));
    assert.ok(hasWorkforcePermission(owner, 'finance.view_salary_qr'));
  });
});

describe('Additional rights UI catalog', () => {
  it('includes salary, attendance, and staff financial keys with short descriptions', () => {
    for (const key of WORKFORCE_ADDITIONAL_RIGHTS) {
      const def = permissionDef(key);
      assert.ok(def, `missing def for ${key}`);
      assert.ok(def!.description.length > 0);
      assert.ok(def!.description.length <= 80);
    }
    assert.ok(WORKFORCE_ADDITIONAL_RIGHTS.includes('finance.view_salary'));
    assert.ok(WORKFORCE_ADDITIONAL_RIGHTS.includes('finance.pay_salary'));
    assert.ok(WORKFORCE_ADDITIONAL_RIGHTS.includes('attendance.view_team'));
  });

  it('AdditionalRightsChecklist renders bracket descriptions', () => {
    const ui = read('src/workforce/components/permissions/AdditionalRightsChecklist.tsx');
    assert.match(ui, /def\.description/);
    assert.match(ui, /AdditionalRightsChecklist/);
  });
});

describe('Server-side payroll authorization', () => {
  it('pay action requires finance.pay_salary', () => {
    const actions = read('src/workforce/actions/payroll.ts');
    assert.match(actions, /requireWorkforcePermission\('finance\.pay_salary'\)/);
    assert.match(actions, /requireWorkforcePermission\('finance\.view_salary'\)/);
  });

  it('staff self-view requires finance.view_own_salary', () => {
    const actions = read('src/workforce/actions/payroll.ts');
    assert.match(actions, /canViewOwnSalary/);
    assert.match(actions, /redirect\('\/me'\)/);
  });

  it('payment details redacted without view_salary_qr permission', () => {
    const payroll = read('src/workforce/services/payroll.ts');
    assert.match(payroll, /includePaymentDetails/);
    assert.match(payroll, /includePaymentDetails \? row\.employee\.upiId : null/);
  });

  it('attendance salary columns use staff.view_financials', () => {
    const attendance = read('src/workforce/actions/attendance.ts');
    assert.match(attendance, /staff\.view_financials/);
  });
});
