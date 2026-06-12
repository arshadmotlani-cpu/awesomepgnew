import { db } from '@/src/db/client';
import { emailDeliveryLog } from '@/src/db/schema';

export type EmailDeliveryLogInput = {
  recipientEmail: string;
  recipientKind: 'tenant' | 'admin_copy' | 'direct';
  subject: string;
  notificationKind: string;
  customerId?: string | null;
  status: 'sent' | 'failed' | 'skipped';
  skipReason?: string | null;
  provider?: string | null;
  messageId?: string | null;
  errorMessage?: string | null;
};

export async function logEmailDelivery(input: EmailDeliveryLogInput): Promise<void> {
  try {
    await db.insert(emailDeliveryLog).values({
      recipientEmail: input.recipientEmail,
      recipientKind: input.recipientKind,
      subject: input.subject,
      notificationKind: input.notificationKind,
      customerId: input.customerId ?? null,
      status: input.status,
      skipReason: input.skipReason ?? null,
      provider: input.provider ?? null,
      messageId: input.messageId ?? null,
      errorMessage: input.errorMessage ?? null,
    });
  } catch (err) {
    console.error('[email] failed to write delivery log:', err);
  }
}
