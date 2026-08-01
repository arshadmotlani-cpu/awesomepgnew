/** Admin room configuration presets — wizard SSOT for type → bed count. */
import { MAX_ROOM_BEDS, sharingTypeName, wizardBedCodes } from '@/src/lib/roomSharing';

export type RoomConfigurationPresetId =
  | 'private'
  | 'sharing-2'
  | 'sharing-3'
  | 'sharing-4'
  | 'sharing-5'
  | 'sharing-6'
  | 'dormitory';

export type RoomConfigurationPreset = {
  id: RoomConfigurationPresetId;
  label: string;
  bedCount: number;
  roomTypeName: string;
  description: string;
};

export const ROOM_CONFIGURATION_PRESETS: RoomConfigurationPreset[] = [
  {
    id: 'private',
    label: 'Private',
    bedCount: 1,
    roomTypeName: 'Private',
    description: '1 bed · single occupancy',
  },
  {
    id: 'sharing-2',
    label: '2 Sharing',
    bedCount: 2,
    roomTypeName: '2 Sharing',
    description: '2 beds · A1, A2',
  },
  {
    id: 'sharing-3',
    label: '3 Sharing',
    bedCount: 3,
    roomTypeName: '3 Sharing',
    description: '3 beds · A1–A3',
  },
  {
    id: 'sharing-4',
    label: '4 Sharing',
    bedCount: 4,
    roomTypeName: '4 Sharing',
    description: '4 beds · A1–A4',
  },
  {
    id: 'sharing-5',
    label: '5 Sharing',
    bedCount: 5,
    roomTypeName: '5 Sharing',
    description: '5 beds · A1–A5',
  },
  {
    id: 'sharing-6',
    label: '6 Sharing',
    bedCount: 6,
    roomTypeName: '6 Sharing',
    description: '6 beds · A1–A6',
  },
  {
    id: 'dormitory',
    label: 'Dormitory',
    bedCount: 6,
    roomTypeName: 'Dormitory',
    description: '6 beds · large shared room',
  },
];

export function getRoomConfigurationPreset(
  id: RoomConfigurationPresetId,
): RoomConfigurationPreset {
  const preset = ROOM_CONFIGURATION_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error('Unknown room type.');
  return preset;
}

export function presetIdFromBedCountAndName(
  bedCount: number,
  roomTypeName: string,
): RoomConfigurationPresetId {
  const trimmed = roomTypeName.trim();
  if (trimmed === 'Private' && bedCount === 1) return 'private';
  if (trimmed === 'Dormitory' && bedCount === 6) return 'dormitory';
  const sharing = ROOM_CONFIGURATION_PRESETS.find(
    (p) => p.bedCount === bedCount && p.roomTypeName === trimmed,
  );
  if (sharing) return sharing.id;
  if (bedCount === 1) return 'private';
  if (bedCount >= 2 && bedCount <= 6) return `sharing-${bedCount}` as RoomConfigurationPresetId;
  return 'sharing-4';
}

/** Preview bed codes for a new room (A1, A2, …). */
export function previewBedCodesForPreset(preset: RoomConfigurationPreset): string[] {
  return wizardBedCodes(0, preset.bedCount);
}

export function assertPresetBedCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > MAX_ROOM_BEDS) {
    throw new Error(`Room type must have between 1 and ${MAX_ROOM_BEDS} beds.`);
  }
}

export function sharingLabelForPreset(preset: RoomConfigurationPreset): string {
  if (preset.id === 'private') return 'Private';
  if (preset.id === 'dormitory') return 'Dormitory';
  return sharingTypeName(preset.bedCount);
}
