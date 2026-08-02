/**
 * Pure helper — derive property index rebuild coordinates from outbox events.
 */

import type { RoomOsEventEnvelope } from '@/src/roomOs/types';

export type PropertyIndexRebuildInput = {
  pgId: string;
  billingMonth?: string;
  asOf?: string;
};

export function extractPropertyIndexRebuildInput(
  event: RoomOsEventEnvelope,
): PropertyIndexRebuildInput | null {
  const payload = event.payload ?? {};
  const payloadPgId = typeof payload.pgId === 'string' ? payload.pgId : null;
  const pgId = payloadPgId ?? (event.streamType === 'property' ? event.streamId : null);
  if (!pgId) return null;

  return {
    pgId,
    billingMonth: typeof payload.billingMonth === 'string' ? payload.billingMonth : undefined,
    asOf: typeof payload.asOf === 'string' ? payload.asOf : undefined,
  };
}
