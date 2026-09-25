/**
 * FYH authoritative staff rights (2026 redesign) — stored on grants like other workforce keys.
 */

import type { WorkforcePermissionDef, WorkforcePermissionGroup } from '@/src/workforce/permissions/library';

type Def = WorkforcePermissionDef & { module: string; resource: string; action: string };

function def(
  key: string,
  label: string,
  group: WorkforcePermissionGroup,
  description: string,
  module: string,
  resource: string,
  action: string,
): Def {
  return { key, label, group, description, module, resource, action };
}

export const FYH_RIGHTS_CATALOG: readonly Def[] = [
  def('dashboard.full', 'Full dashboard', 'dashboard', 'All dashboard modules and revenue views', 'dashboard', 'full', 'view'),
  def(
    'dashboard.revenue.personal',
    'Personal revenue',
    'dashboard',
    'Own product sales and service performance only',
    'dashboard',
    'revenue_personal',
    'view',
  ),
  def(
    'dashboard.revenue.salon',
    'Salon revenue',
    'dashboard',
    'All staff sales and performance plus salon totals',
    'dashboard',
    'revenue_salon',
    'view',
  ),
  def('customers.view', 'Customer view', 'customers', 'Full customer profile wherever shown', 'customers', 'customer', 'view'),
  def('appointments.bookable', 'Can be booked', 'appointments', 'Appear as assignable staff', 'appointments', 'bookable', 'view'),
  def('appointments.view_own', 'View own appointments', 'appointments', 'See only own calendar', 'appointments', 'own', 'view'),
  def('appointments.view_all', 'View all appointments', 'appointments', 'See entire salon calendar', 'appointments', 'all', 'view'),
  def('appointments.add', 'Add appointment', 'appointments', 'Create appointments', 'appointments', 'appointment', 'add'),
  def('appointments.edit', 'Edit appointment', 'appointments', 'Edit, cancel, or delete appointments', 'appointments', 'appointment', 'edit'),
  def('billing.invoices.view', 'View invoices', 'billing', 'View all invoices', 'billing', 'invoice', 'view'),
  def(
    'billing.bill.create',
    'Create / generate bill',
    'billing',
    'Quick Sale, checkout, payments, due, redemptions',
    'billing',
    'bill',
    'create',
  ),
  def('billing.bill.edit', 'Edit bill', 'billing', 'Edit, void, cancel, refund invoices', 'billing', 'bill', 'edit'),
  def('configuration.view', 'View configuration', 'configuration', 'View catalog and salon configuration', 'configuration', 'catalog', 'view'),
  def('configuration.edit', 'Edit configuration', 'configuration', 'Add, edit, remove configuration', 'configuration', 'catalog', 'edit'),
  def('staff.view', 'View staff', 'staff', 'View staff roster and profiles', 'staff', 'roster', 'view'),
  def('staff.edit', 'Edit staff', 'staff', 'Add, edit, deactivate staff and manage rights', 'staff', 'roster', 'edit'),
  def('expenses.general.view', 'View general expenses', 'expenses', 'View non-salary expenses', 'expenses', 'general', 'view'),
  def('expenses.general.add', 'Add general expenses', 'expenses', 'Record general expenses', 'expenses', 'general', 'add'),
  def('expenses.general.edit', 'Edit general expenses', 'expenses', 'Edit or delete general expenses', 'expenses', 'general', 'edit'),
  def('expenses.salary.view', 'View salary expenses', 'expenses', 'View payroll and salary data', 'expenses', 'salary', 'view',),
  def('expenses.salary.add', 'Add salary expenses', 'expenses', 'Record salary payments', 'expenses', 'salary', 'add'),
  def('expenses.salary.edit', 'Edit salary expenses', 'expenses', 'Edit salary payroll records', 'expenses', 'salary', 'edit'),
];
