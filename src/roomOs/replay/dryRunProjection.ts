/**
 * Dry-run projection — never persists materialized rows (Wave 4 replay safety).
 */

import { extractPropertyIndexRebuildInput } from '@/src/roomOs/projectors/property/extractPropertyIndexRebuildInput';
import { projectPropertyOsBundle } from '@/src/roomOs/projectors/property/projectPropertyIndex';
import type { PropertyOsProjectionBundle } from '@/src/roomOs/projectors/property/projectPropertyIndex';
import type { RoomOsEventEnvelope } from '@/src/roomOs/types';
import { todayString } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';

export async function dryRunProjectionFromEvent(
  event: RoomOsEventEnvelope,
): Promise<PropertyOsProjectionBundle | null> {
  const rebuildInput = extractPropertyIndexRebuildInput(event);
  if (!rebuildInput) return null;

  const billingMonth = firstOfMonth(rebuildInput.billingMonth ?? todayString());
  return projectPropertyOsBundle({
    pgId: rebuildInput.pgId,
    billingMonth,
    asOf: rebuildInput.asOf,
  });
}

export async function dryRunProjectionForPg(input: {
  pgId: string;
  billingMonth?: string;
  asOf?: string;
}): Promise<PropertyOsProjectionBundle | null> {
  const billingMonth = firstOfMonth(input.billingMonth ?? todayString());
  return projectPropertyOsBundle({
    pgId: input.pgId,
    billingMonth,
    asOf: input.asOf,
  });
}
