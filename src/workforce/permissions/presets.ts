import type {
  WorkforceJobRole,
  WorkforcePermissionGrants,
  WorkforcePermissionKey,
  WorkforceRank,
} from '@/src/workforce/types';
import { WORKFORCE_PERMISSION_KEYS } from '@/src/workforce/types';
import { normalizeAccessRole } from '@/src/workforce/accessRoles';

const ALL = [...WORKFORCE_PERMISSION_KEYS] as WorkforcePermissionKey[];

const OWNER_GRANTS: WorkforcePermissionGrants = {
  permissions: ALL,
  maxBackdateDays: null,
};

const MANAGER_GRANTS: WorkforcePermissionGrants = {
  permissions: [
    'dashboard.view_revenue',
    'dashboard.view_expenses',
    'dashboard.view_staff',
    'dashboard.view_customers',
    'appointments.receive_bookings',
    'appointments.view_own',
    'appointments.view_all',
    'appointments.edit',
    'billing.create_invoice',
    'billing.edit_invoice',
    'billing.backdate_invoice',
    'inventory.view',
    'inventory.edit',
    'finance.view_expenses',
    'reports.view',
    'reports.export',
    'staff.view',
    'staff.edit',
    'staff.add',
  ],
  maxBackdateDays: 7,
};

const RECEPTIONIST_GRANTS: WorkforcePermissionGrants = {
  permissions: [
    'dashboard.view_customers',
    'appointments.receive_bookings',
    'appointments.view_own',
    'appointments.view_all',
    'appointments.edit',
    'billing.create_invoice',
    'billing.edit_invoice',
    'billing.backdate_invoice',
  ],
  maxBackdateDays: 2,
};

const SERVICE_PROVIDER_GRANTS: WorkforcePermissionGrants = {
  permissions: [
    'dashboard.view_customers',
    'appointments.receive_bookings',
    'appointments.view_own',
  ],
  maxBackdateDays: 0,
};

const ACCOUNTANT_GRANTS: WorkforcePermissionGrants = {
  permissions: [
    'billing.create_invoice',
    'billing.edit_invoice',
    'billing.backdate_invoice',
    'finance.view_expenses',
    'finance.view_profit',
    'reports.view',
    'reports.export',
  ],
  maxBackdateDays: 7,
};

const INVENTORY_MANAGER_GRANTS: WorkforcePermissionGrants = {
  permissions: ['inventory.view', 'inventory.edit'],
  maxBackdateDays: 0,
};

const ATTENDANCE_ONLY_GRANTS: WorkforcePermissionGrants = {
  permissions: [],
  maxBackdateDays: 0,
};

const INTERN_GRANTS: WorkforcePermissionGrants = {
  permissions: ['appointments.view_own'],
  maxBackdateDays: 0,
};

function cloneGrants(g: WorkforcePermissionGrants): WorkforcePermissionGrants {
  return { permissions: [...g.permissions], maxBackdateDays: g.maxBackdateDays };
}

export function defaultGrantsForAccessRole(accessRole: WorkforceJobRole): WorkforcePermissionGrants {
  const role = normalizeAccessRole(accessRole);
  switch (role) {
    case 'owner':
      return cloneGrants(OWNER_GRANTS);
    case 'manager':
      return cloneGrants(MANAGER_GRANTS);
    case 'receptionist':
      return cloneGrants(RECEPTIONIST_GRANTS);
    case 'stylist':
    case 'barber':
    case 'beautician':
    case 'makeup_artist':
    case 'nail_technician':
    case 'hair_assistant':
      return cloneGrants(SERVICE_PROVIDER_GRANTS);
    case 'accountant':
      return cloneGrants(ACCOUNTANT_GRANTS);
    case 'inventory_manager':
      return cloneGrants(INVENTORY_MANAGER_GRANTS);
    case 'cleaner':
      return cloneGrants(ATTENDANCE_ONLY_GRANTS);
    case 'intern':
      return cloneGrants(INTERN_GRANTS);
    default:
      return cloneGrants(SERVICE_PROVIDER_GRANTS);
  }
}

export function defaultGrantsFor(
  _rank: WorkforceRank,
  jobRole: WorkforceJobRole,
): WorkforcePermissionGrants {
  return defaultGrantsForAccessRole(jobRole);
}

export function hasWorkforcePermission(
  grants: WorkforcePermissionGrants | null | undefined,
  key: WorkforcePermissionKey,
): boolean {
  if (!grants) return false;
  return grants.permissions.includes(key);
}

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
  if (role === 'super_admin') return defaultGrantsForAccessRole('owner');
  if (legacyKeys.length === 0) return defaultGrantsForAccessRole('manager');

  const mapped = new Set<WorkforcePermissionKey>();
  for (const k of legacyKeys) {
    if (k === 'page:dashboard') {
      mapped.add('dashboard.view_revenue');
      mapped.add('dashboard.view_customers');
    }
    if (k === 'page:customers') mapped.add('dashboard.view_customers');
    if (k === 'page:appointments') {
      mapped.add('appointments.view_all');
      mapped.add('appointments.edit');
      mapped.add('appointments.receive_bookings');
    }
    if (k === 'page:billing' || k === 'page:quick_sale' || k === 'action:billing.checkout') {
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
    if (k === 'page:settings' || k === 'action:settings.edit') mapped.add('settings.manage');
  }
  return {
    permissions: [...mapped],
    maxBackdateDays: 7,
  };
}
