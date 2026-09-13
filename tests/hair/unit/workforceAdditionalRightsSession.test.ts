import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import { resolveEffectiveGrants } from '@/src/workforce/permissions/resolve';
import { workforceGrantsToHairPermissions } from '@/src/workforce/compat/hairAdminBridge';
import { hasPermission } from '@/src/hair/lib/auth/permissionTypes';
import { isFrontDeskNavProfile } from '@/src/hair/lib/nav';

/** Mirrors production billing@foryour.co custom grant row (usesRoleTemplate: false). */
const BILLING_CUSTOM_GRANTS_SAMPLE = [
  'dashboard.view',
  'dashboard.view_revenue',
  'customers.view',
  'billing.view',
  'inventory.view',
  'reports.view',
  'settings.view',
  'packages.view',
  'memberships.view',
] as const;

describe('WORKFORCE_MEMBERSHIP_AUTH must not discard wf_permission_grants', () => {
  test('custom employee grants override biller role template', async () => {
    const effective = await resolveEffectiveGrants({
      engineId: 'fyh_salon',
      accessRole: 'biller',
      grantRow: {
        permissions: [...BILLING_CUSTOM_GRANTS_SAMPLE],
        maxBackdateDays: 0,
        maxDiscountPercent: null,
        usesRoleTemplate: false,
      },
    });
    assert.equal(effective.permissions.includes('dashboard.view_revenue'), true);
    assert.equal(
      effective.permissions.includes('dashboard.view_revenue'),
      !codeTemplateForAccessRole('biller').permissions.includes('dashboard.view_revenue'),
    );
  });

  test('custom grants map to full nav permissions (not front-desk-only profile)', async () => {
    const effective = await resolveEffectiveGrants({
      engineId: 'fyh_salon',
      accessRole: 'biller',
      grantRow: {
        permissions: [...BILLING_CUSTOM_GRANTS_SAMPLE],
        maxBackdateDays: 0,
        usesRoleTemplate: false,
      },
    });
    const admin = {
      role: 'admin' as const,
      permissions: workforceGrantsToHairPermissions(effective),
    };
    assert.equal(hasPermission(admin, 'page:dashboard_revenue'), true);
    assert.equal(hasPermission(admin, 'page:reports'), true);
    assert.equal(hasPermission(admin, 'page:settings'), true);
    assert.equal(isFrontDeskNavProfile(admin), false);
  });
});
