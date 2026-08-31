import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  logWorkforceEmployeeDbError,
  sanitizeWorkforceEmployeeError,
} from '@/src/workforce/lib/workforceDbError';

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

  test('hides raw SQL failures from the client', () => {
    const err = new Error('Failed query: insert into "wf_employees" ("organization_id") values (null)');
  (err as { cause?: unknown }).cause = {
      code: '23502',
      message: 'null value in column "organization_id" violates not-null constraint',
      column_name: 'organization_id',
      table_name: 'wf_employees',
    };
    assert.equal(
      sanitizeWorkforceEmployeeError(err),
      'Could not save this employee. Please try again or contact support.',
    );
    assert.doesNotThrow(() => logWorkforceEmployeeDbError('test', err));
  });
});

describe('createWorkforceEmployeeAction tenant wiring', () => {
  test('passes session organization and location into createEmployee', () => {
    const src = readFileSync(join(process.cwd(), 'src/workforce/actions/employees.ts'), 'utf8');
    assert.match(src, /resolveEmployeeTenantFromSession/);
    assert.match(src, /organizationId: tenant\.organizationId/);
    assert.match(src, /locationId: tenant\.locationId/);
    assert.match(src, /sanitizeWorkforceEmployeeError/);
    assert.match(src, /logWorkforceEmployeeDbError/);
  });

  test('createEmployee uses a transaction and omits explicit null tenant keys', () => {
    const src = readFileSync(join(process.cwd(), 'src/workforce/services/employees.ts'), 'utf8');
    assert.match(src, /hairDb\.transaction/);
    assert.match(src, /resolveTenantColumns/);
    assert.doesNotMatch(src, /organizationId: input\.organizationId \?\? null/);
    assert.match(src, /deferSideEffects: true/);
    assert.match(src, /post-commit schedule mirror failed/);
  });

  test('AddEmployeePopup binds useActionState form action directly', () => {
    const src = readFileSync(join(process.cwd(), 'src/workforce/components/AddEmployeePopup.tsx'), 'utf8');
    assert.match(src, /action=\{action\}/);
    assert.doesNotMatch(src, /startTransition\(\(\) => action/);
    assert.match(src, /name="qrCodeFile"/);
    assert.doesNotMatch(src, /name="qrCodeUrl"/);
  });

  test('legacy staff schedule mirror passes tenant scope in SaaS mode', () => {
    const src = readFileSync(join(process.cwd(), 'src/workforce/services/schedules.ts'), 'utf8');
    assert.match(src, /StaffScheduleTenantScope/);
    assert.match(src, /tenant\?: StaffScheduleTenantScope/);
  });
});
