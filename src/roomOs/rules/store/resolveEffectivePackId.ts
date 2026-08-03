/**
 * Resolve effective rule pack from DB-published rules — Wave 5.
 */

import {
  buildEffectiveRulePackFromMergedCatalog,
  type EffectiveRulePack,
  type ScopeContext,
} from '@/src/roomOs/rules/effectivePack';
import { mergePublishedRulesWithCatalog } from '@/src/roomOs/rules/mergeCatalog';
import { loadActivePublishedRules } from '@/src/roomOs/rules/store/loadPublishedRules';

export type ResolveEffectivePackInput = ScopeContext & {
  asOf: string;
};

export async function resolveEffectiveRulePack(
  input: ResolveEffectivePackInput,
): Promise<EffectiveRulePack> {
  const publishedRules = await loadActivePublishedRules({
    pgId: input.pgId,
    asOf: input.asOf,
    floorId: input.floorId,
    roomId: input.roomId,
    bedId: input.bedId,
    bookingId: input.bookingId,
  });

  const mergedCatalog = mergePublishedRulesWithCatalog(publishedRules);
  const usesDbRules = publishedRules.length > 0;

  return buildEffectiveRulePackFromMergedCatalog(
    mergedCatalog,
    input.pgId,
    input.asOf,
    {
      floorId: input.floorId,
      roomId: input.roomId,
      bedId: input.bedId,
      bookingId: input.bookingId,
    },
    usesDbRules,
  );
}

export async function resolveEffectivePackId(
  input: ResolveEffectivePackInput,
): Promise<string> {
  const pack = await resolveEffectiveRulePack(input);
  return pack.id;
}
