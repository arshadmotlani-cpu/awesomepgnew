import type { CustomerRoomCard } from '@/src/db/queries/customer';
import { paiseToInr } from '@/src/lib/format';

/** Primary rent display for booking funnel surfaces — always monthly. */
export function formatBookingRentPaise(paise: number): string {
  if (paise <= 0) return '—';
  return `${paiseToInr(paise)}/mo`;
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
