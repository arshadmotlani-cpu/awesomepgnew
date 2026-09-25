/**
 * FYH Staff Rights — UI model (authoritative keys from catalogFyhRights + reports).
 * Single coherent surface for the Staff Rights editor; runtime uses implications + aliases.
 */

import { FYH_RIGHTS_CATALOG } from '@/src/workforce/permissions/catalogFyhRights';
import { permissionSatisfied } from '@/src/workforce/permissions/aliases';

export const FYH_STAFF_RIGHT_KEYS = FYH_RIGHTS_CATALOG.map((d) => d.key) as readonly string[];

export type FyhStaffRightKey = (typeof FYH_STAFF_RIGHT_KEYS)[number] & string;

const KEY_SET = new Set<string>(FYH_STAFF_RIGHT_KEYS);

export function isFyhStaffRightKey(key: string): key is FyhStaffRightKey {
  return KEY_SET.has(key);
}

export type FyhStaffRightsSection = {
  id: string;
  title: string;
  rights: Array<{ key: FyhStaffRightKey; label: string; hint?: string }>;
};

const labelByKey = new Map(FYH_RIGHTS_CATALOG.map((d) => [d.key, d.label]));

function label(key: FyhStaffRightKey): string {
  if (key === 'reports.view') return 'View reports';
  if (key === 'reports.edit') return 'Edit reports';
  if (key === 'reports.export') return 'Export reports';
  return labelByKey.get(key) ?? key;
}

export const FYH_STAFF_RIGHT_SECTIONS: readonly FyhStaffRightsSection[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    rights: [
      { key: 'dashboard.full', label: label('dashboard.full') },
      { key: 'dashboard.revenue.personal', label: label('dashboard.revenue.personal') },
      { key: 'dashboard.revenue.salon', label: label('dashboard.revenue.salon') },
      { key: 'dashboard.view_expenses', label: label('dashboard.view_expenses') },
      { key: 'dashboard.view_appointments', label: label('dashboard.view_appointments') },
    ],
  },
  {
    id: 'customers',
    title: 'Customers',
    rights: [{ key: 'customers.view', label: label('customers.view') }],
  },
  {
    id: 'appointments',
    title: 'Appointments',
    rights: [
      { key: 'appointments.bookable', label: label('appointments.bookable') },
      { key: 'appointments.view_own', label: label('appointments.view_own') },
      { key: 'appointments.view_all', label: label('appointments.view_all') },
      { key: 'appointments.add', label: label('appointments.add') },
      { key: 'appointments.edit', label: label('appointments.edit') },
    ],
  },
  {
    id: 'billing',
    title: 'Billing',
    rights: [
      { key: 'billing.invoices.view', label: label('billing.invoices.view') },
      { key: 'billing.bill.create', label: label('billing.bill.create') },
      { key: 'billing.bill.edit', label: label('billing.bill.edit') },
    ],
  },
  {
    id: 'expenses',
    title: 'Expenses',
    rights: [
      { key: 'expenses.general.view', label: label('expenses.general.view') },
      { key: 'expenses.general.add', label: label('expenses.general.add') },
      { key: 'expenses.general.edit', label: label('expenses.general.edit') },
      { key: 'expenses.salary.view', label: label('expenses.salary.view') },
      { key: 'expenses.salary.add', label: label('expenses.salary.add') },
      { key: 'expenses.salary.edit', label: label('expenses.salary.edit') },
    ],
  },
  {
    id: 'configuration',
    title: 'Configuration',
    rights: [
      { key: 'configuration.view', label: label('configuration.view') },
      { key: 'configuration.edit', label: label('configuration.edit') },
    ],
  },
  {
    id: 'staff',
    title: 'Staff',
    rights: [
      { key: 'staff.view', label: label('staff.view') },
      { key: 'staff.edit', label: label('staff.edit') },
    ],
  },
  {
    id: 'reports',
    title: 'Reports',
    rights: [
      { key: 'reports.view', label: label('reports.view') },
      { key: 'reports.edit', label: label('reports.edit') },
      { key: 'reports.export', label: label('reports.export') },
    ],
  },
];

/** UI-only: checking a parent auto-checks these (display + form submission). */
export const FYH_UI_AUTO_SELECT: Partial<Record<FyhStaffRightKey, readonly FyhStaffRightKey[]>> = {
  'dashboard.full': [
    'dashboard.revenue.personal',
    'dashboard.revenue.salon',
    'dashboard.view_expenses',
    'dashboard.view_appointments',
  ],
  'dashboard.revenue.salon': ['dashboard.revenue.personal'],
  'appointments.edit': ['appointments.view_own'],
  'appointments.view_all': ['appointments.view_own'],
  'billing.bill.edit': ['billing.invoices.view'],
  'billing.bill.create': [],
  'configuration.edit': ['configuration.view'],
  'staff.edit': ['staff.view'],
  'expenses.general.edit': ['expenses.general.view'],
  'expenses.general.add': [],
  'expenses.salary.edit': ['expenses.salary.view'],
  'expenses.salary.add': [],
  'reports.edit': ['reports.view'],
};

/** Keys forced on when a parent is selected (locked in UI). */
export function keysLockedBySelection(selected: ReadonlySet<FyhStaffRightKey>): Set<FyhStaffRightKey> {
  const locked = new Set<FyhStaffRightKey>();
  if (selected.has('dashboard.full')) {
    for (const k of FYH_STAFF_RIGHT_SECTIONS[0]!.rights.map((r) => r.key)) {
      locked.add(k);
    }
  }
  if (selected.has('dashboard.revenue.salon')) locked.add('dashboard.revenue.personal');
  if (selected.has('appointments.view_all')) locked.add('appointments.view_own');
  if (selected.has('appointments.edit')) {
    locked.add('appointments.view_own');
  }
  if (selected.has('billing.bill.edit')) locked.add('billing.invoices.view');
  if (selected.has('configuration.edit')) locked.add('configuration.view');
  if (selected.has('staff.edit')) locked.add('staff.view');
  if (selected.has('expenses.general.edit')) locked.add('expenses.general.view');
  if (selected.has('expenses.salary.edit')) locked.add('expenses.salary.view');
  if (selected.has('reports.edit')) locked.add('reports.view');
  return locked;
}

export function deriveStaffRightsSelection(granted: readonly string[]): Set<FyhStaffRightKey> {
  const selected = new Set<FyhStaffRightKey>();
  for (const key of FYH_STAFF_RIGHT_KEYS) {
    if (granted.includes(key) || permissionSatisfied(granted, key)) {
      selected.add(key);
    }
  }
  return applyUiImplications(selected);
}

export function applyUiImplications(selected: ReadonlySet<FyhStaffRightKey>): Set<FyhStaffRightKey> {
  const out = new Set(selected);
  let changed = true;
  while (changed) {
    changed = false;
    for (const g of [...out]) {
      const implied = FYH_UI_AUTO_SELECT[g];
      if (!implied) continue;
      for (const k of implied) {
        if (!out.has(k)) {
          out.add(k);
          changed = true;
        }
      }
    }
  }
  return out;
}

export function toggleStaffRight(
  selected: ReadonlySet<FyhStaffRightKey>,
  key: FyhStaffRightKey,
  checked: boolean,
): Set<FyhStaffRightKey> {
  const out = new Set(selected);
  if (checked) {
    out.add(key);
    const implied = FYH_UI_AUTO_SELECT[key];
    if (implied) implied.forEach((k) => out.add(k));
    if (key === 'dashboard.full') {
      FYH_STAFF_RIGHT_SECTIONS[0]!.rights.forEach((r) => out.add(r.key));
    }
  } else {
    out.delete(key);
    if (key === 'dashboard.full') {
      FYH_STAFF_RIGHT_SECTIONS[0]!.rights.forEach((r) => out.delete(r.key));
    }
    if (key === 'dashboard.revenue.salon') {
      /* personal may stay */
    }
    if (key === 'billing.invoices.view') {
      out.delete('billing.bill.edit');
    }
    if (key === 'configuration.view') {
      out.delete('configuration.edit');
    }
    if (key === 'staff.view') {
      out.delete('staff.edit');
    }
    if (key === 'expenses.general.view') {
      out.delete('expenses.general.add');
      out.delete('expenses.general.edit');
    }
    if (key === 'expenses.salary.view') {
      out.delete('expenses.salary.add');
      out.delete('expenses.salary.edit');
    }
    if (key === 'reports.view') {
      out.delete('reports.edit');
    }
    if (key === 'appointments.view_own') {
      if (!out.has('appointments.view_all')) {
        out.delete('appointments.edit');
      }
    }
    if (key === 'appointments.view_all') {
      out.delete('appointments.edit');
    }
  }
  return applyUiImplications(out);
}

/** Persist only authoritative staff-right keys (strip unrelated legacy grants). */
export function normalizeStaffRightsForStorage(
  selected: readonly string[],
  existingGrants: readonly string[],
): FyhStaffRightKey[] {
  const chosen = new Set<FyhStaffRightKey>();
  for (const raw of selected) {
    if (isFyhStaffRightKey(raw)) chosen.add(raw);
  }
  const normalized = applyUiImplications(chosen);
  const legacyNonRights = existingGrants.filter((k) => !isFyhStaffRightKey(k));
  return [...legacyNonRights, ...normalized];
}

export function staffRightsKeysForForm(selected: ReadonlySet<FyhStaffRightKey>): FyhStaffRightKey[] {
  return [...applyUiImplications(selected)];
}
