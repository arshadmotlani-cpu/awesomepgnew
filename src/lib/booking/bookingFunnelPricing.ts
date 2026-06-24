import type { CustomerRoomCard } from '@/src/db/queries/customer';
import { paiseToInr } from '@/src/lib/format';

/** Primary rent display for monthly booking funnel surfaces. */
export function formatBookingRentPaise(paise: number): string {
  if (paise <= 0) return '—';
  return `${paiseToInr(paise)}/mo`;
}

/** Starting nightly rate for fixed-date stay cards. */
export function formatBookingNightlyRentPaise(paise: number): string {
  if (paise <= 0) return '—';
  return `From ${paiseToInr(paise)}/night`;
}

export function lowestMonthlyRatePaise(rooms: CustomerRoomCard[]): number {
  const rates = rooms.map((r) => r.monthlyRatePaise).filter((p) => p > 0);
  return rates.length > 0 ? Math.min(...rates) : 0;
}

export function bookingFunnelStartingRentLabel(rooms: CustomerRoomCard[]): string | null {
  const monthly = lowestMonthlyRatePaise(rooms);
  if (monthly > 0) return formatBookingRentPaise(monthly);
  const daily = rooms.map((r) => r.dailyRatePaise).filter((p) => p > 0);
  if (daily.length === 0) return null;
  const minDaily = Math.min(...daily);
  return `${paiseToInr(minDaily)}/day · short stays only`;
}
