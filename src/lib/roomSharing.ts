/** Standard PG sharing labels shown in admin and stored as room type names. */
export const ROOM_SHARING_OPTIONS = [
  { count: 1, label: '1 Sharing (single)' },
  { count: 2, label: '2 Sharing' },
  { count: 3, label: '3 Sharing' },
  { count: 4, label: '4 Sharing' },
  { count: 5, label: '5 Sharing' },
] as const;

export type RoomSharingCount = (typeof ROOM_SHARING_OPTIONS)[number]['count'];

export function sharingTypeName(count: number): string {
  if (count === 1) return '1 Sharing';
  return `${count} Sharing`;
}

export function parseSharingCount(raw: string | null | undefined): RoomSharingCount | null {
  const n = Number.parseInt(raw ?? '', 10);
  if (n >= 1 && n <= 5) return n as RoomSharingCount;
  return null;
}

/** Auto bed labels per room: B1, B2, … (no per-bed photos). */
export function autoBedCodes(existingCount: number, bedsToAdd: number): string[] {
  const codes: string[] = [];
  for (let i = 0; i < bedsToAdd; i += 1) {
    codes.push(`B${existingCount + i + 1}`);
  }
  return codes;
}
