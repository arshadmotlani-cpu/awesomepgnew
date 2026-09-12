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
  const out = { ...customer };
  if (!mask.phone && 'phone' in out) out.phone = REDACTED_PHONE as T['phone'];
  if (!mask.whatsapp && 'whatsapp' in out) out.whatsapp = null as T['whatsapp'];
  if (!mask.email && 'email' in out) out.email = null as T['email'];
  if (!mask.pii) {
    if ('dateOfBirth' in out) out.dateOfBirth = null as T['dateOfBirth'];
    if ('address' in out) out.address = null as T['address'];
    if ('allergies' in out) out.allergies = null as T['allergies'];
    if ('notes' in out) out.notes = REDACTED as T['notes'];
  }
  if (!mask.balance) {
    if ('walletPaise' in out) out.walletPaise = null as T['walletPaise'];
    if ('outstandingPaise' in out) out.outstandingPaise = null as T['outstandingPaise'];
  }
  return out;
}

export function projectStaffFields<T extends Record<string, unknown>>(
  employee: T,
  mask: StaffFieldMask,
): T {
  const out = { ...employee };
  if (!mask.pii) {
    if ('aadhaarNumber' in out) out.aadhaarNumber = null as T['aadhaarNumber'];
    if ('panNumber' in out) out.panNumber = null as T['panNumber'];
    if ('emergencyContact' in out) out.emergencyContact = null as T['emergencyContact'];
  }
  if (!mask.banking) {
    if ('bankAccountHolderName' in out) out.bankAccountHolderName = null as T['bankAccountHolderName'];
    if ('bankName' in out) out.bankName = null as T['bankName'];
    if ('accountNumber' in out) out.accountNumber = null as T['accountNumber'];
    if ('ifscCode' in out) out.ifscCode = null as T['ifscCode'];
    if ('upiId' in out) out.upiId = null as T['upiId'];
    if ('qrCodeUrl' in out) out.qrCodeUrl = null as T['qrCodeUrl'];
  }
  if (!mask.salary) {
    if ('salaryPaise' in out) out.salaryPaise = null as T['salaryPaise'];
  }
  return out;
}
