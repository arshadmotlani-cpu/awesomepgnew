import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { resolvePlatformAccessRoleFromWorkforce } from '@/src/platform/lib/bootstrapAccessRole';

test('workforce staff login without platform user requires platform membership link', () => {
  const accessRole = resolvePlatformAccessRoleFromWorkforce({
    rank: 'team_member',
    jobRole: 'staff',
  });
  assert.equal(accessRole, 'staff');
});

test('billing workforce repair script uses existing biller platform role', () => {
  const src = readFileSync(
    join(process.cwd(), 'scripts/hair-saas-link-workforce-member.ts'),
    'utf8',
  );
  assert.match(src, /--role=/);
  assert.match(src, /linkWorkforceEmployeeToPlatformOrg/);
  assert.match(src, /OWNER_SALON_ORG_SLUG/);
});

test('select-organization nobind path documents missing platform membership bind', () => {
  const src = readFileSync(join(process.cwd(), 'src/hair/lib/auth/guards.ts'), 'utf8');
  assert.match(src, /select-organization\?nobind=1/);
  const bind = readFileSync(
    join(process.cwd(), 'app/(hair)/fyh/select-organization/bind/route.ts'),
    'utf8',
  );
  assert.match(bind, /resolvePlatformUserIdForHairSession/);
  assert.match(bind, /listActiveMembershipsForUser/);
});
