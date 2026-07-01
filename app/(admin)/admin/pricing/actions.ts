'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import {
  applyPgPricingAdjustment,
  type PgPricingAdjustmentSummary,
  type PgPricingRateTier,
} from '@/src/services/pgInventory';

export type PricingAdjustmentActionResult =
  | { ok: true; summary: PgPricingAdjustmentSummary; message: string }
  | { ok: false; error: string };

function formatSummaryMessage(summary: PgPricingAdjustmentSummary, scope: 'pg' | 'room'): string {
  if (scope === 'room') {
    return `Successfully updated ${summary.bedsAffected} bed(s) in room ${summary.roomNumbers[0] ?? ''} · ${summary.pgName}.`;
  }
  return `Successfully updated ${summary.bedsAffected} beds across ${summary.roomsAffected} room${summary.roomsAffected === 1 ? '' : 's'} in ${summary.pgName}.`;
}

async function runAdjustment(input: {
  pgId: string;
  roomId?: string | null;
  tiers: PgPricingRateTier[];
  mode: 'percent' | 'fixed';
  value: number;
}): Promise<PricingAdjustmentActionResult> {
  const session = await requireAdminSession();
  try {
    const summary = await applyPgPricingAdjustment(session, input);
    revalidatePath('/admin/pricing');
    return {
      ok: true,
      summary,
      message: formatSummaryMessage(summary, input.roomId ? 'room' : 'pg'),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to update pricing.',
    };
  }
}

/** Primary workflow — adjust every bed in the selected PG. */
export async function applyPgPricingAdjustmentAction(input: {
  pgId: string;
  tiers: PgPricingRateTier[];
  mode: 'percent' | 'fixed';
  value: number;
}): Promise<PricingAdjustmentActionResult> {
  return runAdjustment({ ...input, roomId: null });
}

/** Exceptional workflow — adjust one room only. */
export async function applyRoomPricingAdjustmentAction(input: {
  pgId: string;
  roomId: string;
  tiers: PgPricingRateTier[];
  mode: 'percent' | 'fixed';
  value: number;
}): Promise<PricingAdjustmentActionResult> {
  return runAdjustment(input);
}

/** @deprecated Use applyPgPricingAdjustmentAction or applyRoomPricingAdjustmentAction */
export async function applyPricingAdjustmentAction(input: {
  pgId: string;
  roomId: string;
  tiers: PgPricingRateTier[];
  mode: 'percent' | 'fixed';
  value: number;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const result = await applyRoomPricingAdjustmentAction(input);
  if (!result.ok) return result;
  return { ok: true, message: result.message };
}
