'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { reviewKycSubmission } from '@/src/services/kyc';

export type KycReviewActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

const KYC_PATHS = ['/admin/residents/kyc', '/admin/kyc'] as const;

function revalidateKyc(submissionId: string) {
  for (const base of KYC_PATHS) {
    revalidatePath(base);
    revalidatePath(`${base}/${submissionId}`);
  }
  revalidatePath('/admin/residents');
}

export async function approveKycAction(
  _prev: KycReviewActionState,
  formData: FormData,
): Promise<KycReviewActionState> {
  const admin = await requireAdminPermission('kyc:write');
  const submissionId = String(formData.get('submissionId') ?? '');
  const result = await reviewKycSubmission({
    submissionId,
    adminId: admin.adminId,
    decision: 'approved',
  });
  if (!result.ok) {
    return { status: 'error', message: result.message };
  }
  revalidateKyc(submissionId);
  return { status: 'ok', message: 'KYC approved.' };
}

export async function rejectKycAction(
  _prev: KycReviewActionState,
  formData: FormData,
): Promise<KycReviewActionState> {
  const admin = await requireAdminPermission('kyc:write');
  const submissionId = String(formData.get('submissionId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim() || 'Documents unclear or invalid';
  const result = await reviewKycSubmission({
    submissionId,
    adminId: admin.adminId,
    decision: 'rejected',
    reason,
  });
  if (!result.ok) {
    return { status: 'error', message: result.message };
  }
  revalidateKyc(submissionId);
  return { status: 'ok', message: 'KYC rejected.' };
}
