/**
 * rules/v1 — effective pack, publication, and evaluation APIs.
 */

import { activateRule } from '@/src/roomOs/rules/store/activateRule';
import { deactivateRule } from '@/src/roomOs/rules/store/deactivateRule';
import { listPublishedRulesForPg } from '@/src/roomOs/rules/store/loadPublishedRules';
import { publishRule } from '@/src/roomOs/rules/store/publishRule';
import { buildEffectiveRulePack } from '@/src/roomOs/rules/effectivePack';
import { resolveEffectiveRulePack } from '@/src/roomOs/rules/store/resolveEffectivePackId';
import { evaluateRules } from '@/src/roomOs/rules/evaluate';
import type { PublishRuleInput } from '@/src/roomOs/rules/store/types';

export type EffectivePackInput = {
  pgId: string;
  asOf?: string;
  floorId?: string;
  roomId?: string;
  bedId?: string;
  bookingId?: string;
};

export async function getEffectiveRulePack(input: EffectivePackInput) {
  const asOf = input.asOf ?? new Date().toISOString();
  try {
    const pack = await resolveEffectiveRulePack({
      pgId: input.pgId,
      asOf,
      floorId: input.floorId,
      roomId: input.roomId,
      bedId: input.bedId,
      bookingId: input.bookingId,
    });
    return { apiVersion: 'rules/v1' as const, pack };
  } catch {
    const pack = buildEffectiveRulePack(input.pgId, asOf, {
      floorId: input.floorId,
      roomId: input.roomId,
      bedId: input.bedId,
      bookingId: input.bookingId,
    });
    return { apiVersion: 'rules/v1' as const, pack };
  }
}

export async function evaluateEffectiveRules(
  input: EffectivePackInput & { facts: Record<string, unknown> },
) {
  const { pack } = await getEffectiveRulePack(input);
  const outcomes = evaluateRules(pack, { facts: input.facts });
  return { apiVersion: 'rules/v1' as const, packId: pack.id, outcomes };
}

export async function listPublishedRules(input: { pgId: string }) {
  const rules = await listPublishedRulesForPg(input.pgId);
  return { apiVersion: 'rules/v1' as const, rules };
}

export async function publishPublishedRule(input: PublishRuleInput) {
  const rule = await publishRule(input);
  return { apiVersion: 'rules/v1' as const, rule };
}

export async function activatePublishedRule(input: {
  publicationId: string;
  publishedBy: string;
  sourceRef?: string;
  effectiveFrom?: string;
}) {
  const rule = await activateRule(input);
  return { apiVersion: 'rules/v1' as const, rule };
}

export async function deactivatePublishedRule(input: {
  publicationId: string;
  publishedBy: string;
  sourceRef?: string;
  effectiveTo?: string;
}) {
  const rule = await deactivateRule(input);
  return { apiVersion: 'rules/v1' as const, rule };
}
