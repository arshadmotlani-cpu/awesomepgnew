import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  NO_ORG_LOCATION_CONFIGURED,
  resolveLocationIdForEmployeeCreate,
} from '@/src/workforce/lib/resolveEmployeeTenant';

function readSrc(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('resolveLocationIdForEmployeeCreate', () => {
  test('prefers session location when it is in the allowed list', () => {
    assert.equal(
      resolveLocationIdForEmployeeCreate({
        sessionLocationId: 'loc-session',
        cookieLocationId: 'loc-cookie',
        allowedLocationIds: ['loc-a', 'loc-session', 'loc-cookie'],
      }),
      'loc-session',
    );
  });

  test('falls back to cookie then first allowed when session location is null', () => {
    assert.equal(
      resolveLocationIdForEmployeeCreate({
        sessionLocationId: null,
        cookieLocationId: 'loc-cookie',
        allowedLocationIds: ['loc-a', 'loc-cookie'],
      }),
      'loc-cookie',
    );
    assert.equal(
      resolveLocationIdForEmployeeCreate({
        sessionLocationId: null,
        allowedLocationIds: ['loc-first', 'loc-second'],
      }),
      'loc-first',
    );
  });

  test('does not invent a location when none are allowed', () => {
    assert.equal(
      resolveLocationIdForEmployeeCreate({
        sessionLocationId: null,
        allowedLocationIds: [],
      }),
      undefined,
    );
  });

  test('does not use a session location that is not in the allowed list', () => {
    assert.equal(
      resolveLocationIdForEmployeeCreate({
        sessionLocationId: 'loc-foreign',
        allowedLocationIds: ['loc-allowed'],
      }),
      'loc-allowed',
    );
  });
});

describe('resolveEmployeeCreateTenant wiring', () => {
  test('create action uses tenant resolver instead of hard-failing on null session.locationId', () => {
    const action = readSrc('src/workforce/actions/employees.ts');
    const resolver = readSrc('src/workforce/lib/resolveEmployeeTenant.ts');
    assert.match(action, /resolveEmployeeCreateTenant\(session\)/);
    assert.match(action, /locationId: tenant\.locationId/);
    assert.doesNotMatch(action, /if \(!session\.locationId\)/);
    assert.match(resolver, /resolveTenantContext\(\)/);
    assert.match(resolver, /NO_ORG_LOCATION_CONFIGURED/);
    assert.equal(
      NO_ORG_LOCATION_CONFIGURED,
      'No staff location is configured. Please select or configure a location before creating an employee.',
    );
  });

  test('createEmployee still requires a resolved location in SaaS mode and does not add location_id to wf_employees', () => {
    const employees = readSrc('src/workforce/services/employees.ts');
    assert.match(employees, /Location context is missing\. Select a location and try again\./);
    assert.match(employees, /locationId: tenantCols\.locationId \?\? input\.locationId/);
    assert.match(employees, /organizationTenantCols/);
    assert.match(employees, /insert\(wfEmployees\)[\s\S]*organizationTenantCols\(tenantCols\)/);
  });
});
