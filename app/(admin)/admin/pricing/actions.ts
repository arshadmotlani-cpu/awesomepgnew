'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { getPgInventory, updateRoomBedPricing, type BedPricingInput } from '@/src/services/pgInventory';
import { computeMonthlyDepositPaise } from '@/src/services/pricing';

type RateTier = 'daily' | 'weekly' | 'monthly';

function adjustPaise(current: number, mode: 'percent' | 'fixed', value: number): number {
  if (current <= 0 && mode === 'percent') return 0;
  if (mode === 'percent') {
    return Math.max(0, Math.round(current * (1 + value / 100)));
  }
  return Math.max(0, current + value);
}

export async function applyPricingAdjustmentAction(input: {
  pgId: string;
  roomId: string;
  tiers: RateTier[];
  mode: 'percent' | 'fixed';
  value: number;
  notifyResident: boolean;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const session = await requireAdminSession();
  try {
    const inv = await getPgInventory(session, input.pgId);
    const roomBeds = inv.beds.filter((b) => b.roomId === input.roomId);
    if (roomBeds.length === 0) return { ok: false, error: 'No beds in this room.' };

    const sample = roomBeds[0]!;
    let daily = sample.dailyRatePaise;
    let weekly = sample.weeklyRatePaise;
    let monthly = sample.monthlyRatePaise;

    if (input.tiers.includes('daily')) {
      daily = adjustPaise(daily, input.mode, input.value);
    }
    if (input.tiers.includes('weekly')) {
      weekly = adjustPaise(weekly, input.mode, input.value);
    }
    if (input.tiers.includes('monthly')) {
      monthly = adjustPaise(monthly, input.mode, input.value);
    }

    const monthlyDeposit = monthly > 0 ? computeMonthlyDepositPaise({
      bedPriceId: 'adj',
      dailyRatePaise: daily,
      weeklyRatePaise: weekly,
      monthlyRatePaise: monthly,
      securityDepositPaise: monthly * 2,
      dailySecurityDepositPaise: sample.dailyDepositPaise,
      weeklySecurityDepositPaise: sample.weeklyDepositPaise,
      monthlySecurityDepositPaise: monthly * 2,
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
    }) : sample.monthlyDepositPaise;

    const pricing: BedPricingInput = {
      dailyRatePaise: daily,
      weeklyRatePaise: weekly,
      monthlyRatePaise: monthly,
      dailyDepositPaise: sample.dailyDepositPaise,
      weeklyDepositPaise: sample.weeklyDepositPaise,
      monthlyDepositPaise: monthlyDeposit,
    };

    await updateRoomBedPricing(session, input.pgId, input.roomId, pricing, {
      notifyResident: input.notifyResident,
    });

    revalidatePath('/admin/pricing');

    return {
      ok: true,
      message: `Rates updated for ${roomBeds.length} bed(s). Deposit requirements synced for active tenants.`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to update pricing.',
    };
  }
}
