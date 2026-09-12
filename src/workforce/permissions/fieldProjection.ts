/**
 * Field-level permission projection — strip sensitive data when grants missing.
 */

import type { WorkforcePermissionGrants } from '@/src/workforce/types';
import { permissionSatisfied } from '@/src/workforce/permissions/aliases';

export type CustomerFieldMask = {
  phone?: boolean;
  whatsapp?: boolean;
  email?: boolean;
  pii?: boolean;
  balance?: boolean;
  packageCredits?: boolean;
};

export type StaffFieldMask = {
  pii?: boolean;
  banking?: boolean;
  salary?: boolean;
};

const REDACTED_PHONE = '••••••••••';
const REDACTED = '[restricted]';

export function customerFieldMask(grants: WorkforcePermissionGrants): CustomerFieldMask {
  return {
    phone: permissionSatisfied(grants.permissions, 'customers.phone.view'),
    whatsapp: permissionSatisfied(grants.permissions, 'customers.phone.view'),
    email: permissionSatisfied(grants.permissions, 'customers.pii.view'),
    pii: permissionSatisfied(grants.permissions, 'customers.pii.view'),
    balance: permissionSatisfied(grants.permissions, 'customers.balance.view'),
    packageCredits: permissionSatisfied(grants.permissions, 'customers.package_credits.view'),
  };
}

export function staffFieldMask(grants: WorkforcePermissionGrants): StaffFieldMask {
  return {
    pii: permissionSatisfied(grants.permissions, 'staff.pii.view'),
    banking: permissionSatisfied(grants.permissions, 'staff.banking.view'),
    salary: permissionSatisfied(grants.permissions, 'payroll.salary.view') ||
      permissionSatisfied(grants.permissions, 'staff.view_financials'),
  };
}

export function projectCustomerFields<T extends Record<string, unknown>>(
  customer: T,
  mask: CustomerFieldMask,
): T {
  const out: Record<string, unknown> = { ...customer };
  if (!mask.phone && 'phone' in out) out.phone = REDACTED_PHONE;
  if (!mask.whatsapp && 'whatsapp' in out) out.whatsapp = null;
  if (!mask.email && 'email' in out) out.email = null;
  if (!mask.pii) {
    if ('dateOfBirth' in out) out.dateOfBirth = null;
    if ('address' in out) out.address = null;
    if ('allergies' in out) out.allergies = null;
    if ('notes' in out) out.notes = REDACTED;
  }
  if (!mask.balance) {
    if ('walletPaise' in out) out.walletPaise = null;
    if ('outstandingPaise' in out) out.outstandingPaise = null;
  }
  return out as T;
}

export function projectStaffFields<T extends Record<string, unknown>>(
  employee: T,
  mask: StaffFieldMask,
): T {
  const out: Record<string, unknown> = { ...employee };
  if (!mask.pii) {
    if ('aadhaarNumber' in out) out.aadhaarNumber = null;
    if ('panNumber' in out) out.panNumber = null;
    if ('emergencyContact' in out) out.emergencyContact = null;
  }
  if (!mask.banking) {
    if ('bankAccountHolderName' in out) out.bankAccountHolderName = null;
    if ('bankName' in out) out.bankName = null;
    if ('accountNumber' in out) out.accountNumber = null;
    if ('ifscCode' in out) out.ifscCode = null;
    if ('upiId' in out) out.upiId = null;
    if ('qrCodeUrl' in out) out.qrCodeUrl = null;
  }
  if (!mask.salary) {
    if ('salaryPaise' in out) out.salaryPaise = null;
  }
  return out as T;
}
