import type { PgAmenities } from '@/src/db/schema/pgs';
import type { RoomSharingCount } from './roomSharing';

export type StayPricingMode = 'daily' | 'weekly' | 'monthly';

export type SharingPresetPaise = {
  dailyRatePaise?: number;
  weeklyRatePaise?: number;
  monthlyRatePaise?: number;
  dailyDepositPaise?: number;
  weeklyDepositPaise?: number;
  monthlyDepositPaise?: number;
};

export type SharingPresetMatrix = Partial<Record<RoomSharingCount, SharingPresetPaise>>;

function readRow(
  raw: Record<string, unknown> | undefined,
  sharing: string,
): SharingPresetPaise | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw[sharing];
  if (!row || typeof row !== 'object') return undefined;
  const r = row as Record<string, unknown>;
  const out: SharingPresetPaise = {};
  const map: Array<[keyof SharingPresetPaise, string, string]> = [
    ['dailyRatePaise', 'dailyRatePaise', 'dailyRate'],
    ['weeklyRatePaise', 'weeklyRatePaise', 'weeklyRate'],
    ['monthlyRatePaise', 'monthlyRatePaise', 'monthlyRate'],
    ['dailyDepositPaise', 'dailyDepositPaise', 'dailyDeposit'],
    ['weeklyDepositPaise', 'weeklyDepositPaise', 'weeklyDeposit'],
    ['monthlyDepositPaise', 'monthlyDepositPaise', 'monthlyDeposit'],
  ];
  for (const [key, modern, legacy] of map) {
    const n = Number(r[modern] ?? r[legacy]);
    if (Number.isFinite(n) && n >= 0) out[key] = Math.round(n);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function readSharingPresets(
  amenities: PgAmenities | null | undefined,
): SharingPresetMatrix {
  const out: SharingPresetMatrix = {};
  const modern = amenities?.sharingPresetsPaise;
  for (const key of ['1', '2', '3', '4', '5'] as const) {
    const row = readRow(modern as Record<string, unknown> | undefined, key);
    if (row) out[Number(key) as RoomSharingCount] = row;
  }
  // Legacy: flat deposit → monthly deposit only
  const legacy = amenities?.depositBySharingPaise;
  if (legacy && typeof legacy === 'object') {
    for (const key of ['1', '2', '3', '4', '5'] as const) {
      const n = Number(legacy[key]);
      if (!Number.isFinite(n) || n < 0) continue;
      const count = Number(key) as RoomSharingCount;
      out[count] = { ...out[count], monthlyDepositPaise: Math.round(n) };
    }
  }
  return out;
}

export function mergeSharingPresets(
  amenities: PgAmenities,
  updates: SharingPresetMatrix,
): PgAmenities {
  const current = { ...(amenities.sharingPresetsPaise ?? {}) } as Record<string, SharingPresetPaise>;
  for (const [count, row] of Object.entries(updates)) {
    if (!row) continue;
    current[String(count)] = { ...current[String(count)], ...row };
  }
  return { ...amenities, sharingPresetsPaise: current };
}

export function presetRupees(paise: number | undefined): string {
  if (paise == null) return '';
  return (paise / 100).toString();
}

export function presetForSharing(
  matrix: SharingPresetMatrix,
  sharing: RoomSharingCount,
): SharingPresetPaise {
  return matrix[sharing] ?? {};
}

/** @deprecated use readSharingPresets */
export type DepositPresetsPaise = Partial<Record<RoomSharingCount, number>>;

/** @deprecated */
export function readDepositPresets(amenities: PgAmenities | null | undefined): DepositPresetsPaise {
  const matrix = readSharingPresets(amenities);
  const out: DepositPresetsPaise = {};
  for (const [count, row] of Object.entries(matrix)) {
    const n = row?.monthlyDepositPaise;
    if (n != null) out[Number(count) as RoomSharingCount] = n;
  }
  return out;
}
