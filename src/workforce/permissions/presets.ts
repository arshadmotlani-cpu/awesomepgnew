import type {
  WorkforceJobRole,
  WorkforcePermissionGrants,
  WorkforcePermissionKey,
  WorkforceRank,
} from '@/src/workforce/types';
import { WORKFORCE_PERMISSION_KEYS } from '@/src/workforce/types';

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

const TEAM_MEMBER_STYLIST: WorkforcePermissionGrants = {
  permissions: [
    'appointments.receive_bookings',
    'appointments.view_own',
    'billing.create_invoice',
  ],
  maxBackdateDays: 0,
};

const TEAM_MEMBER_RECEPTION: WorkforcePermissionGrants = {
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

const TEAM_MEMBER_NO_BOOKINGS: WorkforcePermissionGrants = {
  permissions: ['appointments.view_own'],
  maxBackdateDays: 0,
};

export function defaultGrantsFor(
  rank: WorkforceRank,
  jobRole: WorkforceJobRole,
): WorkforcePermissionGrants {
  if (rank === 'owner' || jobRole === 'owner') return { ...OWNER_GRANTS, permissions: [...OWNER_GRANTS.permissions] };
  if (rank === 'manager' || jobRole === 'manager') {
    return { ...MANAGER_GRANTS, permissions: [...MANAGER_GRANTS.permissions] };
  }
  if (jobRole === 'receptionist') {
    return { ...TEAM_MEMBER_RECEPTION, permissions: [...TEAM_MEMBER_RECEPTION.permissions] };
  }
  if (jobRole === 'stylist') {
    return { ...TEAM_MEMBER_STYLIST, permissions: [...TEAM_MEMBER_STYLIST.permissions] };
  }
  if (
    jobRole === 'cleaner' ||
    jobRole === 'housekeeping' ||
    jobRole === 'security' ||
    jobRole === 'driver' ||
    jobRole === 'accountant'
  ) {
    const base = { ...TEAM_MEMBER_NO_BOOKINGS, permissions: [...TEAM_MEMBER_NO_BOOKINGS.permissions] };
    if (jobRole === 'accountant') {
      base.permissions.push(
        'finance.view_expenses',
        'reports.view',
        'billing.create_invoice',
        'billing.edit_invoice',
      );
    }
    return base;
  }
  return { ...TEAM_MEMBER_STYLIST, permissions: [...TEAM_MEMBER_STYLIST.permissions] };
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
  if (role === 'super_admin') return defaultGrantsFor('owner', 'owner');
  if (legacyKeys.length === 0) return defaultGrantsFor('manager', 'manager');

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
