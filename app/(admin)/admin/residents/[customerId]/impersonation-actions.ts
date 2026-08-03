'use server';

import { redirect } from 'next/navigation';
import { requireSuperAdmin } from '@/src/lib/auth/guards';
import {
  listImpersonationAuditForCustomer,
  residentPortalUrl,
  startResidentImpersonation,
} from '@/src/lib/auth/impersonation';
import { IMPERSONATION_DEFAULT_REASON } from '@/src/lib/auth/impersonationPolicy';

export async function startResidentImpersonationAction(args: {
  customerId: string;
  reason?: string;
}): Promise<{ ok: false; error: string } | never> {
  const session = await requireSuperAdmin();
  const result = await startResidentImpersonation({
    adminSession: session,
    customerId: args.customerId,
    reason: args.reason?.trim() || IMPERSONATION_DEFAULT_REASON,
    returnPath: `/admin/residents/${args.customerId}`,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  redirect(result.redirectTo);
}

export async function loadImpersonationAuditAction(customerId: string) {
  await requireSuperAdmin();
  const rows = await listImpersonationAuditForCustomer(customerId, 30);
  return rows.map((row) => ({
    ...row,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
  }));
}

export async function getResidentPortalUrlAction(): Promise<string> {
  return residentPortalUrl();
}
