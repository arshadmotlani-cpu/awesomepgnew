/**
 * Room configuration SSOT — sharing capacity + catalog pricing effective on a date.
 *
 * Physical beds change only when a schedule is applied; pricing uses bed_prices windows.
 */
import type { BedPricingInput } from '@/src/services/pgInventory';

export type RoomConfigurationPricing = BedPricingInput & {
  monthlyRatePaise: number;
  monthlyDepositPaise: number;
};

export type RoomConfigurationEffectiveOn = {
  asOfDate: string;
  sharingCapacity: number;
  roomTypeName: string;
  hasAc: boolean;
  pricing: RoomConfigurationPricing;
  /** Physical active beds today (inventory). */
  physicalBedCount: number;
  /** True when a schedule defines capacity/pricing from asOfDate onward. */
  fromSchedule: boolean;
  scheduleId?: string;
  scheduleStatus?: 'scheduled' | 'applied';
};

export function pricingFromScheduleRow(row: {
  dailyRatePaise: number;
  weeklyRatePaise: number;
  monthlyRatePaise: number;
  dailyDepositPaise: number;
  weeklyDepositPaise: number;
  monthlyDepositPaise: number;
}): RoomConfigurationPricing {
  return {
    dailyRatePaise: row.dailyRatePaise,
    weeklyRatePaise: row.weeklyRatePaise,
    monthlyRatePaise: row.monthlyRatePaise,
    dailyDepositPaise: row.dailyDepositPaise,
    weeklyDepositPaise: row.weeklyDepositPaise,
    monthlyDepositPaise: row.monthlyDepositPaise,
  };
}
