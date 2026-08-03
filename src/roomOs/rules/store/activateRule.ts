/**
 * Activate a published rule row — Wave 5 rule store.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { roomOsPublishedRules } from '@/src/db/schema/roomOsPublishedRules';
import { mapPublishedRuleRow, type ActivateRuleInput, type PublishedRuleRecord } from '@/src/roomOs/rules/store/types';

export async function activateRule(input: ActivateRuleInput): Promise<PublishedRuleRecord> {
  const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();

  const [updated] = await db
    .update(roomOsPublishedRules)
    .set({
      status: 'active',
      effectiveFrom,
      effectiveTo: null,
      publishedBy: input.publishedBy,
      sourceRef: input.sourceRef ?? 'rules/v1/activate',
      publishedAt: new Date(),
    })
    .where(eq(roomOsPublishedRules.id, input.publicationId))
    .returning();

  if (!updated) {
    throw new Error(`Publication ${input.publicationId} not found`);
  }

  return mapPublishedRuleRow(updated);
}
