'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requirePlatformAdminPage } from '@/src/platform/lib/auth/guards';
import {
  approveSubmission,
  rejectSubmission,
  upsertBillingQrSettings,
} from '@/src/platform/services/manualSubscriptionPayments';

function reviewPath(query?: string): string {
  return query
    ? `/platform/admin/payment-submissions?${query}`
    : '/platform/admin/payment-submissions';
}

export async function saveBillingQrSettingsAction(formData: FormData): Promise<void> {
  const session = await requirePlatformAdminPage();
  await upsertBillingQrSettings({
    qrImageUrl: String(formData.get('qrImageUrl') ?? ''),
    upiId: String(formData.get('upiId') ?? ''),
    updatedByUserId: session.userId,
  });
  revalidatePath('/platform/admin/payment-submissions');
  redirect(reviewPath('saved=qr'));
}

export async function approveSubscriptionPaymentAction(formData: FormData): Promise<void> {
  const session = await requirePlatformAdminPage();
  const id = String(formData.get('submissionId') ?? '').trim();
  if (!id) redirect(reviewPath('error=missing'));

  const result = await approveSubmission(id, session.userId);
  revalidatePath('/platform/admin/payment-submissions');
  revalidatePath('/platform/admin/subscriptions');
  if (!result.ok) {
    redirect(reviewPath(`error=${encodeURIComponent(result.error)}`));
  }
  redirect(reviewPath('approved=1'));
}

export async function rejectSubscriptionPaymentAction(formData: FormData): Promise<void> {
  const session = await requirePlatformAdminPage();
  const id = String(formData.get('submissionId') ?? '').trim();
  const note = String(formData.get('reviewNote') ?? '').trim();
  if (!id) redirect(reviewPath('error=missing'));

  const result = await rejectSubmission(id, note || 'Rejected', session.userId);
  revalidatePath('/platform/admin/payment-submissions');
  if (!result.ok) {
    redirect(reviewPath(`error=${encodeURIComponent(result.error)}`));
  }
  redirect(reviewPath('rejected=1'));
}
