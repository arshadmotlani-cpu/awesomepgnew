/** Standard PG sharing labels shown in admin and stored as room type names. */
export const MAX_ROOM_BEDS = 6;

export const ROOM_SHARING_OPTIONS = [
  { count: 1, label: '1 Sharing (single)' },
  { count: 2, label: '2 Sharing' },
  { count: 3, label: '3 Sharing' },
  { count: 4, label: '4 Sharing' },
  { count: 5, label: '5 Sharing' },
  { count: 6, label: '6 Sharing' },
] as const;

export type RoomSharingCount = (typeof ROOM_SHARING_OPTIONS)[number]['count'];

export function sharingTypeName(count: number): string {
  if (count === 1) return '1 Sharing';
  return `${count} Sharing`;
}

export function parseSharingCount(raw: string | null | undefined): RoomSharingCount | null {
  const n = Number.parseInt(raw ?? '', 10);
  if (n >= 1 && n <= MAX_ROOM_BEDS) return n as RoomSharingCount;
  return null;
}

/** Auto bed labels per room: B1, B2, … (legacy inventory path). */
export function autoBedCodes(existingCount: number, bedsToAdd: number): string[] {
  const codes: string[] = [];
  for (let i = 0; i < bedsToAdd; i += 1) {
    codes.push(`B${existingCount + i + 1}`);
  }
  return codes;
}

/** Wizard / guided setup: A1, A2, … */
export function wizardBedCodes(existingCount: number, bedsToAdd: number): string[] {
  const codes: string[] = [];
  for (let i = 0; i < bedsToAdd; i += 1) {
    codes.push(`A${existingCount + i + 1}`);
  }
  return codes;
}

/**
 * Continue bed code sequence in a room (prefers existing letter prefix).
 *
 * Pass ALL bed codes ever used in the room (active + archived) so new codes never
 * collide with the unique (room_id, bed_code) index.
 */
export function nextBedCodesForRoom(allRoomBedCodes: string[], bedsToAdd: number): string[] {
  if (bedsToAdd <= 0) return [];
  const codeSet = new Set(allRoomBedCodes.map((c) => c.trim()));

  if (allRoomBedCodes.length === 0) {
    return wizardBedCodes(0, bedsToAdd);
  }

  const parsed = allRoomBedCodes
    .map((code) => {
      const match = /^([A-Za-z-]+)(\d+)$/.exec(code.trim());
      if (!match) return null;
      return { prefix: match[1]!, num: Number.parseInt(match[2]!, 10) };
    })
    .filter((v): v is { prefix: string; num: number } => v != null);

  if (parsed.length === 0) {
    return autoBedCodes(allRoomBedCodes.length, bedsToAdd);
  }

  const prefix = parsed[0]!.prefix;
  let nextNum = Math.max(...parsed.map((p) => p.num));
  const codes: string[] = [];
  while (codes.length < bedsToAdd) {
    nextNum += 1;
    const candidate = `${prefix}${nextNum}`;
    if (!codeSet.has(candidate)) {
      codes.push(candidate);
      codeSet.add(candidate);
    }
  }
  return codes;
}
