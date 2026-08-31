import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  logWorkforceEmployeeDbError,
  sanitizeWorkforceEmployeeError,
} from '@/src/workforce/lib/workforceDbError';
import {
  shouldAllowEmployeeFormSubmit,
  shouldBlockEmployeeFormEnter,
} from '@/src/workforce/lib/addEmployeeFormGuard';
import {
  reconcileScheduleWithWeekOff,
  syncScheduleWithWeekOff,
  normalizeScheduleDays,
} from '@/src/workforce/lib/scheduleEditor';

function readSrc(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('sanitizeWorkforceEmployeeError', () => {
  test('passes through known safe validation messages', () => {
    assert.equal(
      sanitizeWorkforceEmployeeError(new Error('An employee with this email already exists.')),
      'An employee with this email already exists.',
    );
    assert.equal(
      sanitizeWorkforceEmployeeError(new Error('Organization context is missing. Sign in again or contact support.')),
      'Organization context is missing. Sign in again or contact support.',
    );
  });

  test('maps unique email violations to a safe duplicate message', () => {
    const err = new Error('Failed query: insert into "wf_employees" (...) values (...)');
    (err as { cause?: unknown }).cause = {
      code: '23505',
      constraint_name: 'wf_employees_org_email_uidx',
      message: 'duplicate key value violates unique constraint',
    };
    assert.equal(
      sanitizeWorkforceEmployeeError(err),
      'An employee with this email already exists.',
    );
  });

  test('never returns raw PostgreSQL/Drizzle errors to the client', () => {
    const err = new Error('Failed query: insert into "wf_employees" ("organization_id") values (null)');
    (err as { cause?: unknown }).cause = {
      code: '23502',
      message: 'null value in column "organization_id" violates not-null constraint',
      column_name: 'organization_id',
      table_name: 'wf_employees',
    };
    const msg = sanitizeWorkforceEmployeeError(err);
    assert.equal(msg, 'Unable to create employee right now. Please try again.');
    assert.doesNotMatch(msg, /Failed query/);
    assert.doesNotMatch(msg, /insert into/);
    assert.doesNotMatch(msg, /organization_id/);
    assert.doesNotThrow(() => logWorkforceEmployeeDbError('test', err));
  });

  test('does not leak e.message dumps that look like SQL even without Failed query prefix', () => {
    const msg = sanitizeWorkforceEmployeeError(new Error('insert into wf_employees password_hash=$1'));
    assert.equal(msg, 'Unable to create employee right now. Please try again.');
  });
});

describe('Add Employee form submission guards', () => {
  test('Shift Schedule and every nav tab are type=button and live outside the form', () => {
    const popup = readSrc('src/workforce/components/AddEmployeePopup.tsx');
    const nav = readSrc('src/workforce/components/EmployeeProfileNav.tsx');
    const navBlock = popup.split('<form')[0] ?? '';
    assert.match(navBlock, /EmployeeProfileNav/);
    assert.match(nav, /type="button"/);
    assert.match(nav, /Shift Schedule/);
    for (const label of ['Staff Details', 'Credentials', 'Salary & Incentives', 'Additional Rights', 'Shift Schedule']) {
      assert.match(nav, new RegExp(label));
    }
    assert.doesNotMatch(nav, /type="submit"/);
  });

  test('Enter in schedule/time fields is blocked; only Create employee may submit', () => {
    assert.equal(shouldBlockEmployeeFormEnter(null), true);
    assert.equal(shouldAllowEmployeeFormSubmit(null), false);
    const popup = readSrc('src/workforce/components/AddEmployeePopup.tsx');
    assert.match(popup, /data-create-employee="1"/);
    assert.match(popup, /shouldBlockEmployeeFormEnter/);
    assert.match(popup, /shouldAllowEmployeeFormSubmit/);
    assert.match(popup, /onKeyDown=\{handleFormKeyDown\}/);
    assert.match(popup, /onSubmit=\{handleFormSubmit\}/);
  });

  test('QR is a file field, not a hidden base64 qrCodeUrl', () => {
    const popup = readSrc('src/workforce/components/AddEmployeePopup.tsx');
    assert.match(popup, /name="qrCodeFile"/);
    assert.doesNotMatch(popup, /name="qrCodeUrl"/);
    assert.doesNotMatch(popup, /data:image/);
    assert.doesNotMatch(popup, /startTransition\(\(\) => action/);
  });
});

describe('createWorkforceEmployeeAction tenant wiring', () => {
  test('passes session organization and location into createEmployee', () => {
    const src = readSrc('src/workforce/actions/employees.ts');
    assert.match(src, /resolveEmployeeTenantFromSession/);
    assert.match(src, /organizationId: tenant\.organizationId/);
    assert.match(src, /locationId: tenant\.locationId/);
    assert.match(src, /sanitizeWorkforceEmployeeError/);
    assert.match(src, /logWorkforceEmployeeDbError/);
    assert.doesNotMatch(src, /e instanceof Error \? e\.message/);
  });

  test('missing organizationId cannot produce an explicit NULL tenant insert', () => {
    const src = readSrc('src/workforce/services/employees.ts');
    assert.match(src, /Organization context is required to create an employee/);
    assert.match(src, /resolveTenantColumns/);
    assert.doesNotMatch(src, /organizationId: input\.organizationId \?\? null/);
  });

  test('createEmployee uses a transaction wrapping core writes', () => {
    const src = readSrc('src/workforce/services/employees.ts');
    assert.match(src, /hairDb\.transaction/);
    assert.match(src, /insert\(wfEmployees\)/);
    assert.match(src, /insert\(wfEngineMemberships\)/);
    assert.match(src, /insert\(wfPermissionGrants\)/);
    assert.match(src, /upsertEmployeeWeeklySchedule/);
    assert.match(src, /deferSideEffects: true/);
    assert.match(src, /post-commit schedule mirror failed/);
  });

  test('legacy staff schedule mirror passes tenant scope in SaaS mode', () => {
    const src = readSrc('src/workforce/services/schedules.ts');
    assert.match(src, /StaffScheduleTenantScope/);
    assert.match(src, /tenant\?: StaffScheduleTenantScope/);
  });
});

describe('week-off persistence contract', () => {
  test('Monday weekly-off sets Monday is_off true', () => {
    const synced = syncScheduleWithWeekOff(normalizeScheduleDays(), [1]);
    assert.equal(synced.find((d) => d.dayOfWeek === 1)?.isOff, true);
  });

  test('Sunday weekly-off still works', () => {
    const synced = syncScheduleWithWeekOff(normalizeScheduleDays(), [0]);
    assert.equal(synced.find((d) => d.dayOfWeek === 0)?.isOff, true);
  });

  test('reconcile makes weekOffDays authoritative on save', () => {
    const days = reconcileScheduleWithWeekOff(
      [{ dayOfWeek: 1, startTime: '09:00', endTime: '18:00', isOff: false }],
      [1],
    );
    assert.equal(days.find((d) => d.dayOfWeek === 1)?.isOff, true);
  });
});
