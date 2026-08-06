import type {
  WorkforceJobRole,
  WorkforcePermissionGrants,
  WorkforcePermissionKey,
  WorkforceRank,
} from '@/src/workforce/types';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import { hasWorkforcePermission } from '@/src/workforce/permissions/resolve';

/** @deprecated Use codeTemplateForAccessRole or resolveEffectiveGrants */
export function defaultGrantsForAccessRole(accessRole: WorkforceJobRole): WorkforcePermissionGrants {
  return codeTemplateForAccessRole(accessRole);
}

/** @deprecated Use resolveEffectiveGrants */
export function defaultGrantsFor(
  _rank: WorkforceRank,
  jobRole: WorkforceJobRole,
): WorkforcePermissionGrants {
  return codeTemplateForAccessRole(jobRole);
}

export { hasWorkforcePermission };

export function mergeGrants(
  base: WorkforcePermissionGrants,
  overrides?: Partial<WorkforcePermissionGrants>,
): WorkforcePermissionGrants {
  return {
    permissions: overrides?.permissions ?? base.permissions,
    maxBackdateDays:
      overrides && 'maxBackdateDays' in overrides
        ? overrides.maxBackdateDays ?? null
        : base.maxBackdateDays,
  };
}

/** Map legacy HairPermission keys onto Workforce grants (migration). */
export function mapLegacyHairPermissions(
  role: 'super_admin' | 'admin',
  legacyKeys: string[],
): WorkforcePermissionGrants {
  if (role === 'super_admin') return codeTemplateForAccessRole('owner');
  if (legacyKeys.length === 0) return codeTemplateForAccessRole('manager');

  const mapped = new Set<WorkforcePermissionKey>();
  for (const k of legacyKeys) {
    if (k === 'page:dashboard') {
      mapped.add('dashboard.view_revenue');
      mapped.add('dashboard.view_customers');
      mapped.add('dashboard.view');
    }
    if (k === 'page:customers') {
      mapped.add('customers.view');
      mapped.add('dashboard.view_customers');
    }
    if (k === 'page:appointments') {
      mapped.add('appointments.view_all');
      mapped.add('appointments.edit');
      mapped.add('appointments.receive_bookings');
    }
    if (k === 'page:billing' || k === 'page:quick_sale' || k === 'action:billing.checkout') {
      mapped.add('billing.view');
      mapped.add('billing.create_invoice');
      mapped.add('billing.edit_invoice');
    }
    if (k === 'page:inventory' || k === 'action:inventory.adjust') {
      mapped.add('inventory.view');
      mapped.add('inventory.edit');
    }
    if (k === 'page:reports' || k === 'action:reports.export') {
      mapped.add('reports.view');
      mapped.add('reports.export');
    }
    if (k === 'page:settings' || k === 'action:settings.edit') {
      mapped.add('settings.view');
      mapped.add('settings.manage');
    }
  }
  return {
    permissions: [...mapped],
    maxBackdateDays: 7,
  };
}
