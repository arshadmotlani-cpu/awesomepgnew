'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import {
  lookupResidentAuthProfile,
  runAuthIntegrityCheck,
  type AuthIntegrityIssue,
} from '@/src/services/authIntegrityCheck';
import { repairAuthIntegrityIssue } from '@/src/services/authIntegrityRepair';

export async function loadAuthIntegrityReport(search?: {
  phone?: string;
  email?: string;
  name?: string;
}) {
  await requireAdminSession('/admin/system/auth-integrity');
  const [report, profiles] = await Promise.all([
    runAuthIntegrityCheck(search),
    lookupResidentAuthProfile(search ?? {}),
  ]);
  return { report, profiles };
}

export async function repairAuthIssueAction(formData: FormData) {
  await requireAdminSession('/admin/system/auth-integrity');

  const issue: AuthIntegrityIssue = {
    checkType: String(formData.get('checkType') ?? '') as AuthIntegrityIssue['checkType'],
    customerId: String(formData.get('customerId') ?? ''),
    customerName: String(formData.get('customerName') ?? ''),
    email: String(formData.get('email') ?? '') || null,
    phone: String(formData.get('phone') ?? '') || null,
    detail: String(formData.get('detail') ?? ''),
    autoRepairable: formData.get('autoRepairable') === 'true',
    relatedCustomerId: String(formData.get('relatedCustomerId') ?? '') || undefined,
    metadata: formData.get('metadata')
      ? (JSON.parse(String(formData.get('metadata'))) as Record<string, unknown>)
      : undefined,
  };

  const result = await repairAuthIntegrityIssue(issue, { dryRun: false });
  revalidatePath('/admin/system/auth-integrity');
  return result;
}
