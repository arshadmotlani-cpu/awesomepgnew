import { normalizeAccessRole } from '@/src/workforce/accessRoles';
import type { WorkforceJobRole } from '@/src/workforce/types';
import {
  WORKFORCE_PERMISSION_KEYS,
  type WorkforcePermissionKey,
} from '@/src/workforce/permissions/library';

export type WorkforcePermissionGrants = {
  permissions: WorkforcePermissionKey[];
  /** null = unlimited (Owner) */
  maxBackdateDays: number | null;
};

const ALL = [...WORKFORCE_PERMISSION_KEYS] as WorkforcePermissionKey[];

const OWNER_TEMPLATE: WorkforcePermissionKey[] = [...ALL];

const MANAGER_TEMPLATE: WorkforcePermissionKey[] = ALL.filter(
  (k) =>
    ![
      'permissions.manage',
      'system.settings',
      'settings.manage',
      'configuration.edit',
    ].includes(k),
);

const BILLER_TEMPLATE: WorkforcePermissionKey[] = [
  'customers.view',
  'customers.edit',
  'appointments.receive_bookings',
  'appointments.view_own',
  'appointments.view_all',
  'appointments.edit',
  'billing.view',
  'billing.create_invoice',
  'billing.edit_invoice',
  'billing.backdate_invoice',
  'packages.view',
  'memberships.view',
  'calendar.view',
  'cash_drawer.view',
  'cash_drawer.manage',
];

const STAFF_TEMPLATE: WorkforcePermissionKey[] = [
  'appointments.view_own',
  'appointments.receive_bookings',
  'calendar.view',
  'customers.view',
];

const TEMPLATE_BY_ROLE: Record<
  'owner' | 'manager' | 'biller' | 'staff',
  { permissions: WorkforcePermissionKey[]; maxBackdateDays: number | null }
> = {
  owner: { permissions: OWNER_TEMPLATE, maxBackdateDays: null },
  manager: { permissions: MANAGER_TEMPLATE, maxBackdateDays: 7 },
  biller: { permissions: BILLER_TEMPLATE, maxBackdateDays: 2 },
  staff: { permissions: STAFF_TEMPLATE, maxBackdateDays: 0 },
};

/** Code-default permission templates for the four access roles. */
export const CODE_ROLE_TEMPLATES: Record<
  WorkforceJobRole,
  { permissions: WorkforcePermissionKey[]; maxBackdateDays: number | null }
> = {
  owner: TEMPLATE_BY_ROLE.owner,
  manager: TEMPLATE_BY_ROLE.manager,
  biller: TEMPLATE_BY_ROLE.biller,
  staff: TEMPLATE_BY_ROLE.staff,
  receptionist: TEMPLATE_BY_ROLE.biller,
  stylist: TEMPLATE_BY_ROLE.staff,
  barber: TEMPLATE_BY_ROLE.staff,
  beautician: TEMPLATE_BY_ROLE.staff,
  makeup_artist: TEMPLATE_BY_ROLE.staff,
  nail_technician: TEMPLATE_BY_ROLE.staff,
  hair_assistant: TEMPLATE_BY_ROLE.staff,
  cleaner: TEMPLATE_BY_ROLE.staff,
  accountant: TEMPLATE_BY_ROLE.biller,
  inventory_manager: TEMPLATE_BY_ROLE.staff,
  intern: TEMPLATE_BY_ROLE.staff,
  housekeeping: TEMPLATE_BY_ROLE.staff,
  security: TEMPLATE_BY_ROLE.staff,
  driver: TEMPLATE_BY_ROLE.staff,
};

export function codeTemplateForAccessRole(accessRole: WorkforceJobRole): WorkforcePermissionGrants {
  const role = normalizeAccessRole(accessRole);
  const key = role as keyof typeof TEMPLATE_BY_ROLE;
  const tpl = TEMPLATE_BY_ROLE[key] ?? TEMPLATE_BY_ROLE.staff;
  return {
    permissions: [...tpl.permissions],
    maxBackdateDays: tpl.maxBackdateDays,
  };
}
