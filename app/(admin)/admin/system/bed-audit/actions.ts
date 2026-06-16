'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { repairBedAuditIssue, runBedAudit, type BedAuditIssue } from '@/src/services/bedAudit';

export async function repairBedIssueAction(formData: FormData) {
  const session = await requireAdminSession('/admin/system/bed-audit');
  const kind = String(formData.get('kind') ?? '') as BedAuditIssue['kind'];
  const bedId = String(formData.get('bedId') ?? '');
  const bedCode = String(formData.get('bedCode') ?? '');
  const roomNumber = String(formData.get('roomNumber') ?? '');
  const pgId = String(formData.get('pgId') ?? '');
  const pgName = String(formData.get('pgName') ?? '');
  const detail = String(formData.get('detail') ?? '');
  const bookingId = String(formData.get('bookingId') ?? '') || undefined;
  const customerId = String(formData.get('customerId') ?? '') || undefined;

  const result = await repairBedAuditIssue(
    {
      kind,
      bedId,
      bedCode,
      roomNumber,
      pgId,
      pgName,
      detail,
      bookingId,
      customerId,
    },
    session.adminId,
  );

  revalidatePath('/admin/system/bed-audit');
  revalidatePath('/admin/pgs');
  revalidatePath('/admin/operations');
  return result;
}

export async function loadBedAuditReport() {
  await requireAdminSession('/admin/system/bed-audit');
  return runBedAudit();
}
