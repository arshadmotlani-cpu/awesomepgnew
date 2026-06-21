import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { paymentLinks } from '@/src/db/schema';

export type PaymentLinkAccessResult =
  | { ok: true; link: typeof paymentLinks.$inferSelect }
  | { ok: false; status: 404 | 403; message: string };

/** Payment links are capability URLs — possession of linkId grants view + proof upload. */
export async function assertActivePaymentLink(linkId: string): Promise<PaymentLinkAccessResult> {
  const trimmed = linkId.trim();
  if (!trimmed) {
    return { ok: false, status: 404, message: 'Payment link not found.' };
  }

  const [link] = await db
    .select()
    .from(paymentLinks)
    .where(eq(paymentLinks.id, trimmed))
    .limit(1);

  if (!link) {
    return { ok: false, status: 404, message: 'Payment link not found.' };
  }
  if (link.status === 'expired') {
    return { ok: false, status: 403, message: 'This payment link has expired.' };
  }
  if (link.status !== 'active') {
    return { ok: false, status: 403, message: 'This payment link is no longer active.' };
  }

  return { ok: true, link };
}
