import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isSystemProviderEmployee,
  SYSTEM_OWNER_DISPLAY_NAME,
} from '@/src/workforce/services/systemOwnerProvider';

describe('System owner provider', () => {
  test('isSystemProviderEmployee detects flag', () => {
    assert.equal(isSystemProviderEmployee({ isSystemProvider: true }), true);
    assert.equal(isSystemProviderEmployee({ isSystemProvider: false }), false);
    assert.equal(isSystemProviderEmployee({}), false);
  });

  test('display name is Arshad', () => {
    assert.equal(SYSTEM_OWNER_DISPLAY_NAME, 'Arshad');
  });

  test('StaffManagementList excludes system providers from listing', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(process.cwd(), 'src/workforce/components/StaffManagementList.tsx'),
      'utf8',
    );
    assert.match(src, /excludeSystemProviders:\s*true/);
  });

  test('employee profile blocks system provider', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(process.cwd(), 'app/(hair)/fyh/(app)/staff/[employeeId]/page.tsx'),
      'utf8',
    );
    assert.match(src, /isSystemProviderEmployee/);
  });

  test('updateEmployee guards system provider deactivation', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(process.cwd(), 'src/workforce/services/employees.ts'),
      'utf8',
    );
    assert.match(src, /isSystemProvider/);
    assert.match(src, /cannot be deactivated/i);
  });
});
