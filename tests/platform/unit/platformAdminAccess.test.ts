/**
 * Platform administrator access — super membership table only (not org owner).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { ECOSYSTEM_ADMIN_EMAIL } from '@/src/lib/auth/ecosystemAdmin';
import { setPlatformAdminMembership } from '@/src/platform/services/admin';

const root = process.cwd();

describe('Platform administrator access', () => {
  test('isPlatformAdmin is derived only from platform_memberships super table', () => {
    const sessionSrc = readFileSync(
      join(root, 'src/platform/lib/auth/session.ts'),
      'utf8',
    );
    const guardsSrc = readFileSync(join(root, 'src/platform/lib/auth/guards.ts'), 'utf8');

    assert.match(sessionSrc, /platformMembershipsSuper/);
    assert.match(sessionSrc, /isPlatformAdmin:\s*superRows\.length\s*>\s*0/);
    assert.doesNotMatch(sessionSrc, /memberships.*isPlatformAdmin|isPlatformAdmin.*memberships/);
    assert.match(guardsSrc, /session\.isPlatformAdmin/);
    assert.doesNotMatch(guardsSrc, /admin@foryour\.co|ECOSYSTEM_ADMIN_EMAIL/);
  });

  test('org owner membership does not imply platform admin in guards', () => {
    const guardsSrc = readFileSync(join(root, 'src/platform/lib/auth/guards.ts'), 'utf8');
    assert.doesNotMatch(guardsSrc, /role.*owner|owner.*isPlatformAdmin/);
    assert.match(guardsSrc, /!session\.isPlatformAdmin/);
  });

  test('setPlatformAdminMembership contract inserts and deletes super rows', () => {
    const adminSrc = readFileSync(join(root, 'src/platform/services/admin.ts'), 'utf8');
    assert.match(adminSrc, /export async function setPlatformAdminMembership/);
    assert.match(adminSrc, /platformMembershipsSuper/);
    assert.match(adminSrc, /enabled && !existing[\s\S]*insert\(platformMembershipsSuper\)/);
    assert.match(adminSrc, /!enabled && existing[\s\S]*delete\(platformMembershipsSuper\)/);
    assert.equal(typeof setPlatformAdminMembership, 'function');
  });

  test('migration 0008 grants super admin by email only (idempotent, no org bypass)', () => {
    const migration = readFileSync(
      join(root, 'src/platform/db/migrations/0008_grant_ecosystem_platform_admin.sql'),
      'utf8',
    );
    const journal = readFileSync(
      join(root, 'src/platform/db/migrations/meta/_journal.json'),
      'utf8',
    );

    assert.match(migration, /INSERT INTO platform\.platform_memberships/);
    assert.match(migration, new RegExp(`lower\\(u\\.email\\)\\s*=\\s*'${ECOSYSTEM_ADMIN_EMAIL}'`));
    assert.match(migration, /ON CONFLICT DO NOTHING/);
    assert.doesNotMatch(migration, /for-your-hair|platform\.organizations|platform\.memberships/i);
    assert.match(journal, /0008_grant_ecosystem_platform_admin/);
  });
});
