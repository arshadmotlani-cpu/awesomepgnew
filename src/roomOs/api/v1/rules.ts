/**
 * rules/v1/effectivePack — debug/admin API stub.
 */

import { buildEffectiveRulePack } from '@/src/roomOs/rules/effectivePack';
import { evaluateRules } from '@/src/roomOs/rules/evaluate';

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
  const pack = buildEffectiveRulePack(input.pgId, asOf, {
    floorId: input.floorId,
    roomId: input.roomId,
    bedId: input.bedId,
    bookingId: input.bookingId,
  });
  return { apiVersion: 'rules/v1' as const, pack };
}

export async function evaluateEffectiveRules(
  input: EffectivePackInput & { facts: Record<string, unknown> },
) {
  const { pack } = await getEffectiveRulePack(input);
  const outcomes = evaluateRules(pack, { facts: input.facts });
  return { apiVersion: 'rules/v1' as const, packId: pack.id, outcomes };
}
