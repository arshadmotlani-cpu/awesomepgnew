import { paiseToInr } from '@/src/lib/format';
import type { PgInventoryBedRow } from '@/src/services/pgInventory';

export type RoomRateSnapshot = {
  dailyPaise: number;
  weeklyPaise: number;
  monthlyPaise: number;
};

export function ratesFromBeds(beds: PgInventoryBedRow[]): RoomRateSnapshot | null {
  const first = beds[0];
  if (!first) return null;
  return {
    dailyPaise: first.dailyRatePaise,
    weeklyPaise: first.weeklyRatePaise,
    monthlyPaise: first.monthlyRatePaise,
  };
}

export function formatRentSummary(rates: RoomRateSnapshot): string {
  const monthly = paiseToInr(rates.monthlyPaise);
  const weekly =
    rates.weeklyPaise > 0 ? paiseToInr(rates.weeklyPaise) : '—';
  const daily = rates.dailyPaise > 0 ? paiseToInr(rates.dailyPaise) : '—';
  return `${monthly}/mo · Weekly ${weekly} · Daily ${daily}`;
}

export function formatRentSuccessMessage(rates: RoomRateSnapshot): string {
  const monthly = paiseToInr(rates.monthlyPaise);
  const weekly =
    rates.weeklyPaise > 0 ? paiseToInr(rates.weeklyPaise) : '—';
  const daily = rates.dailyPaise > 0 ? paiseToInr(rates.dailyPaise) : '—';
  return `✓ Rent updated — Monthly ${monthly} · Weekly ${weekly} · Daily ${daily}`;
}

export function bedStatusLabel(status: string): string {
  if (status === 'maintenance') return 'Disabled';
  if (status === 'blocked') return 'Blocked';
  if (status === 'occupied') return 'Occupied';
  return 'Available';
}

export function bedStatusTone(status: string): string {
  if (status === 'maintenance' || status === 'blocked') return 'text-amber-300';
  if (status === 'occupied') return 'text-sky-300';
  return 'text-emerald-300';
}
