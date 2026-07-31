'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/src/hair/lib/auth/permissions';
import {
  buildNotificationPreview,
  processOutboxBatch,
  sendAppointmentReminders,
  sendBirthdayMessages,
  sendLowStockAlerts,
  sendMembershipExpiryWarnings,
  sendOutstandingPaymentReminders,
} from '@/src/hair/services/notifications';

export async function getNotificationPreviewAction(input: {
  kind: 'whatsapp_invoice' | 'review_request';
  customerName: string;
  customerPhone: string;
  grandTotalPaise?: number;
  invoiceNumber?: string;
}) {
  await requirePermission('action:settings.edit');
  const baseUrl =
    typeof process.env.NEXT_PUBLIC_APP_URL === 'string'
      ? process.env.NEXT_PUBLIC_APP_URL
      : undefined;
  return buildNotificationPreview({ ...input, baseUrl });
}

export async function processOutboxBatchAction(limit = 20) {
  await requirePermission('action:settings.edit');
  const result = await processOutboxBatch(limit);
  revalidatePath('/loyalty');
  revalidatePath('/settings/communication');
  return result;
}

export async function runNotificationAutomationsAction() {
  await requirePermission('action:settings.edit');
  const [reminders, birthdays, membership, outstanding, lowStock] = await Promise.all([
    sendAppointmentReminders(),
    sendBirthdayMessages(),
    sendMembershipExpiryWarnings(),
    sendOutstandingPaymentReminders(),
    sendLowStockAlerts(),
  ]);
  revalidatePath('/loyalty');
  return {
    appointmentReminders: reminders,
    birthdayMessages: birthdays,
    membershipExpiryWarnings: membership,
    outstandingPaymentReminders: outstanding,
    lowStockAlerts: lowStock,
  };
}
