/**
 * Owner salon (For Your Hair) represented as a normal complimentary SaaS tenant.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { PLATFORM_MEMBERSHIP_ROLES } from '@/src/platform/db/schema';
import {
  OWNER_SALON_ORG_SLUG,
  OWNER_SALON_PLAN_SLUGS,
  OWNER_SALON_PRODUCT_LABEL,
} from '@/src/platform/lib/ownerSalonTenant';
import {
  formatSubscriptionAnnualCharge,
  subscriptionAnnualChargePaise,
} from '@/src/platform/lib/subscriptionChargeDisplay';
import {
  PLATFORM_TENANT_ACCESS_ROLES,
  platformTenantRoleLabel,
} from '@/src/platform/lib/tenantAccessRoles';
import { resolveCreateSubscriptionPeriod } from '@/src/platform/lib/subscriptionTrial';
import { workforceGrantsToHairPermissions } from '@/src/workforce/compat/hairAdminBridge';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import { hasWorkforcePermission } from '@/src/workforce/permissions/resolve';
import { hasPermission } from '@/src/hair/lib/auth/permissionTypes';

const root = process.cwd();

describe('Owner salon SaaS tenant model', () => {
  test('For Your Hair uses canonical slug and SOFT product label', () => {
    assert.equal(OWNER_SALON_ORG_SLUG, 'for-your-hair');
    assert.equal(OWNER_SALON_PRODUCT_LABEL, 'SOFT');
    assert.equal(OWNER_SALON_PLAN_SLUGS.production, 'fyhair-production');
    assert.equal(OWNER_SALON_PLAN_SLUGS.staging, 'fyh-staging');
  });

  test('bootstrap script does not hard-code runtime tenant bypasses', () => {
    const bootstrapSrc = readFileSync(
      join(root, 'scripts/hair-saas-bootstrap-platform.ts'),
      'utf8',
    );
    const layoutSrc = readFileSync(join(root, 'app/(hair)/fyh/(app)/layout.tsx'), 'utf8');
    const membershipsSrc = readFileSync(
      join(root, 'src/platform/services/memberships.ts'),
      'utf8',
    );

    assert.doesNotMatch(layoutSrc, /for-your-hair/);
    assert.doesNotMatch(membershipsSrc, /for-your-hair/);
    assert.match(bootstrapSrc, /OWNER_SALON_ORG_SLUG/);
    assert.match(bootstrapSrc, /complimentary/);
    assert.doesNotMatch(bootstrapSrc, /status:\s*'active'/);
  });

  test('complimentary subscription has zero annual charge and no period end', () => {
    const period = resolveCreateSubscriptionPeriod({ subscriptionStatus: 'complimentary' });
    assert.equal(period.currentPeriodEnd, null);
    assert.equal(
      formatSubscriptionAnnualCharge({ status: 'complimentary', amountPaise: 650_000 }),
      '₹0 / year',
    );
    assert.equal(subscriptionAnnualChargePaise({ status: 'complimentary' }), 0);
  });

  test('complimentary orgs cannot submit SaaS payment (no fake invoices)', () => {
    const manualSrc = readFileSync(
      join(root, 'src/platform/services/manualSubscriptionPayments.ts'),
      'utf8',
    );
    const subscribeSrc = readFileSync(join(root, 'src/hair/actions/subscribe.ts'), 'utf8');
    assert.match(manualSrc, /Complimentary organizations do not submit payment/);
    assert.match(subscribeSrc, /isComplimentarySubscription/);
  });

  test('migration sets for-your-hair subscription to complimentary', () => {
    const sql = readFileSync(
      join(root, 'src/platform/db/migrations/0007_owner_salon_complimentary.sql'),
      'utf8',
    );
    assert.match(sql, /for-your-hair/);
    assert.match(sql, /complimentary/);
    assert.match(sql, /current_period_end = NULL/);
  });
});

describe('SaaS Admin tenant user roles', () => {
  test('platform tenant roles include receptionist and manager', () => {
    assert.deepEqual([...PLATFORM_TENANT_ACCESS_ROLES], [...PLATFORM_MEMBERSHIP_ROLES]);
    assert.ok(PLATFORM_TENANT_ACCESS_ROLES.includes('receptionist'));
    assert.ok(PLATFORM_TENANT_ACCESS_ROLES.includes('manager'));
    assert.ok(PLATFORM_TENANT_ACCESS_ROLES.includes('owner'));
    assert.equal(platformTenantRoleLabel('receptionist'), 'Receptionist');
    assert.equal(platformTenantRoleLabel('manager'), 'Manager');
  });

  test('SaaS Admin members page uses shared tenant role catalog', () => {
    const membersPage = readFileSync(
      join(root, 'app/(platform)/platform/admin/organizations/[id]/members/page.tsx'),
      'utf8',
    );
    assert.match(membersPage, /PLATFORM_TENANT_ACCESS_ROLES/);
    assert.match(membersPage, /platformTenantRoleLabel/);
    assert.doesNotMatch(membersPage, /const ACCESS_ROLES = \['owner', 'co_owner', 'manager', 'biller', 'staff'\]/);
  });

  test('receptionist SOFT permissions remain restricted', () => {
    const receptionist = codeTemplateForAccessRole('receptionist');
    const manager = codeTemplateForAccessRole('manager');
    const hairReceptionist = {
      role: 'admin' as const,
      permissions: workforceGrantsToHairPermissions(receptionist),
    };

    assert.ok(hasWorkforcePermission(receptionist, 'billing.create_invoice'));
    assert.equal(hasWorkforcePermission(receptionist, 'staff.view'), false);
    assert.equal(hasWorkforcePermission(receptionist, 'permissions.manage'), false);
    assert.ok(hasWorkforcePermission(manager, 'staff.view'));
    assert.equal(hasPermission(hairReceptionist, 'page:settings'), false);
    assert.equal(hasPermission(hairReceptionist, 'page:expenses'), false);
  });

  test('platform admin shell is separate from SOFT tenant app', () => {
    const platformLayout = readFileSync(
      join(root, 'app/(platform)/platform/admin/layout.tsx'),
      'utf8',
    );
    const hairLayout = readFileSync(join(root, 'app/(hair)/fyh/(app)/layout.tsx'), 'utf8');
    assert.match(platformLayout, /requirePlatformAdmin/);
    assert.doesNotMatch(hairLayout, /requirePlatformAdmin/);
    assert.doesNotMatch(hairLayout, /platform\/admin/);
  });
});
