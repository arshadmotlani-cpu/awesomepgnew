import { db } from '@/src/db/client';
import { auditLog } from '@/src/db/schema';

export type WhatsAppLogKind =
  | 'rent_due'
  | 'rent_updated'
  | 'electricity_due'
  | 'kyc'
  | 'deposit'
  | 'bed_assignment'
  | 'payment_rejection';

export async function logWhatsAppEvent(args: {
  adminId?: string | null;
  residentId?: string | null;
  phone: string;
  kind: WhatsAppLogKind;
  messagePreview: string;
  paymentLinkId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(auditLog).values({
    actorType: args.adminId ? 'admin' : 'system',
    actorId: args.adminId ?? null,
    entity: 'whatsapp_message',
    entityId: args.residentId ?? args.phone,
    action: 'send_prepared',
    diff: {
      kind: args.kind,
      phone: args.phone,
      messagePreview: args.messagePreview.slice(0, 500),
      paymentLinkId: args.paymentLinkId ?? null,
      ...args.metadata,
    },
  });
}
