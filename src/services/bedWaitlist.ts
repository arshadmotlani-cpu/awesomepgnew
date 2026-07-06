/**
 * Bed waitlist — Mode 3 transfer (occupied, no vacating notice).
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bedWaitlistEntries } from '@/src/db/schema';

export async function joinBedWaitlist(input: {
  bedId: string;
  customerId: string;
  bookingId?: string;
  roomChangeRequestId?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const existing = await db
    .select({ id: bedWaitlistEntries.id })
    .from(bedWaitlistEntries)
    .where(
      and(
        eq(bedWaitlistEntries.bedId, input.bedId),
        eq(bedWaitlistEntries.customerId, input.customerId),
        eq(bedWaitlistEntries.status, 'active'),
      ),
    )
    .limit(1);
  if (existing.length > 0) return { ok: true };

  await db.insert(bedWaitlistEntries).values({
    bedId: input.bedId,
    customerId: input.customerId,
    bookingId: input.bookingId ?? null,
    roomChangeRequestId: input.roomChangeRequestId ?? null,
    status: 'active',
  });

  await db.insert(auditLog).values({
    actorType: 'customer',
    actorId: input.customerId,
    entity: 'bed_waitlist',
    entityId: input.bedId,
    action: 'waitlist_joined',
    diff: { bookingId: input.bookingId },
  });

  return { ok: true };
}
