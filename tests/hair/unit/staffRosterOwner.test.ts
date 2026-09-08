import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { formatStaffDisplayName } from '@/src/workforce/lib/staffDisplayName';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Staff roster includes owner employee profile', () => {
  it('StaffManagementList does not exclude system provider employees', () => {
    const src = read('src/workforce/components/StaffManagementList.tsx');
    assert.doesNotMatch(src, /excludeSystemProviders:\s*true/);
    assert.match(src, /organizationId:\s*ctx\?\.organizationId/);
    assert.match(src, /formatStaffDisplayName/);
  });

  it('employee profile does not block system provider rows', () => {
    const src = read('app/(hair)/fyh/(app)/staff/[employeeId]/page.tsx');
    assert.doesNotMatch(src, /isSystemProviderEmployee/);
  });

  it('attendance team roster does not use POS exclusion filter', () => {
    const src = read('src/hair/adapters/workforceStaffAdapter.ts');
    const fn = src.slice(src.indexOf('export async function listTeamStaffForAttendance'));
    const nextExport = fn.indexOf('export async function listActiveSalonStaffRoster');
    const body = fn.slice(0, nextExport);
    assert.doesNotMatch(body, /filterSelectablePosStaff/);
  });

  it('Quick Sale bookable roster still uses POS exclusion filter', () => {
    const src = read('src/hair/adapters/workforceStaffAdapter.ts');
    const fn = src.slice(src.indexOf('export async function listBookableStaffForSalon'));
    const nextExport = fn.indexOf('export async function listTeamStaffForAttendance');
    const body = fn.slice(0, nextExport);
    assert.match(body, /filterSelectablePosStaff/);
  });

  it('owner system provider id is formatted once for display', () => {
    assert.equal(formatStaffDisplayName('Arshad'), 'Arshad');
    assert.equal(formatStaffDisplayName('arshad motlani'), 'Arshad Motlani');
  });
});

describe('Staff roster dedupe semantics', () => {
  it('listTeamStaffForAttendance merges by employee id in adapter source', () => {
    const src = read('src/hair/adapters/workforceStaffAdapter.ts');
    const fn = src.slice(src.indexOf('export async function listTeamStaffForAttendance'));
    const nextExport = fn.indexOf('export async function listActiveSalonStaffRoster');
    const body = fn.slice(0, nextExport);
    assert.match(body, /new Map<string/);
    assert.match(body, /byId\.has\(row\.id\)/);
  });
});
