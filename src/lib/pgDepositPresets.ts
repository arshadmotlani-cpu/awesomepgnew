import type { PgAmenities } from '@/src/db/schema/pgs';
import type { RoomSharingCount } from './roomSharing';

export type DepositPresetsPaise = Partial<Record<RoomSharingCount, number>>;

export function readDepositPresets(amenities: PgAmenities | null | undefined): DepositPresetsPaise {
  const raw = amenities?.depositBySharingPaise;
  if (!raw || typeof raw !== 'object') return {};
  const out: DepositPresetsPaise = {};
  for (const key of ['1', '2', '3', '4', '5'] as const) {
    const n = Number(raw[key]);
    if (Number.isFinite(n) && n >= 0) out[Number(key) as RoomSharingCount] = Math.round(n);
  }
  return out;
}

export function mergeDepositPresets(
  amenities: PgAmenities,
  updates: DepositPresetsPaise,
): PgAmenities {
  const current = { ...(amenities.depositBySharingPaise ?? {}) };
  for (const [count, paise] of Object.entries(updates)) {
    if (paise == null || !Number.isFinite(paise) || paise < 0) continue;
    current[String(count)] = Math.round(paise);
  }
  return { ...amenities, depositBySharingPaise: current };
}

export function depositPresetRupees(
  presets: DepositPresetsPaise,
  sharing: RoomSharingCount,
): string {
  const paise = presets[sharing];
  if (paise == null) return '';
  return (paise / 100).toString();
}
