/**
 * Room capacity change planner — preserves bed UUIDs and naming conventions.
 *
 * When increasing capacity, reactivate archived beds in the room before creating new ones.
 * When decreasing, only surplus empty beds may be archived (occupied beds block the change).
 */
import { nextBedCodesForRoom } from '@/src/lib/roomSharing';

export type BedCodeRef = { id: string; bedCode: string };

export type RoomCapacityIncreasePlan = {
  /** Existing active beds — never modified. */
  preserveBedIds: string[];
  /** Archived beds to restore (same UUID, same bed code). */
  reactivateBedIds: string[];
  reactivatedBedCodes: string[];
  /** Brand-new bed codes to insert when no archived surplus exists. */
  createBedCodes: string[];
};

export type RoomCapacityDecreasePlan = {
  preserveBedIds: string[];
  archiveBedIds: string[];
  archiveBedCodes: string[];
  blocked: boolean;
  blockMessage?: string;
};

/** Natural sort for bed codes (B1, B2, … B10; A1; etc.). */
export function parseBedCodeParts(code: string): { prefix: string; num: number } | null {
  const match = /^([A-Za-z-]+)(\d+)$/.exec(code.trim());
  if (!match) return null;
  return { prefix: match[1]!, num: Number.parseInt(match[2]!, 10) };
}

export function compareBedCodes(a: string, b: string): number {
  const pa = parseBedCodeParts(a);
  const pb = parseBedCodeParts(b);
  if (pa && pb) {
    const prefixCmp = pa.prefix.localeCompare(pb.prefix);
    if (prefixCmp !== 0) return prefixCmp;
    return pa.num - pb.num;
  }
  return a.localeCompare(b, undefined, { numeric: true });
}

export function sortBedCodes(codes: string[]): string[] {
  return [...codes].sort(compareBedCodes);
}

/**
 * Plan bed additions for a capacity increase.
 * Reactivates archived beds (lowest code first) before allocating new codes.
 */
export function planRoomCapacityIncrease(input: {
  activeBeds: BedCodeRef[];
  archivedBeds: BedCodeRef[];
  bedsToAdd: number;
}): RoomCapacityIncreasePlan {
  const preserveBedIds = input.activeBeds.map((b) => b.id);
  if (input.bedsToAdd <= 0) {
    return {
      preserveBedIds,
      reactivateBedIds: [],
      reactivatedBedCodes: [],
      createBedCodes: [],
    };
  }

  const allCodes = [
    ...input.activeBeds.map((b) => b.bedCode),
    ...input.archivedBeds.map((b) => b.bedCode),
  ];

  const reactivateBedIds: string[] = [];
  const reactivatedBedCodes: string[] = [];
  const archivedSorted = [...input.archivedBeds].sort((a, b) =>
    compareBedCodes(a.bedCode, b.bedCode),
  );

  let remaining = input.bedsToAdd;
  for (const bed of archivedSorted) {
    if (remaining <= 0) break;
    reactivateBedIds.push(bed.id);
    reactivatedBedCodes.push(bed.bedCode);
    remaining -= 1;
  }

  const createBedCodes =
    remaining > 0 ? nextBedCodesForRoom(allCodes, remaining) : [];

  return {
    preserveBedIds,
    reactivateBedIds,
    reactivatedBedCodes,
    createBedCodes,
  };
}

/**
 * Plan surplus bed archival for a capacity decrease.
 * Archives highest-numbered empty beds first; blocks if any surplus bed is occupied.
 */
export function planRoomCapacityDecrease(input: {
  activeBeds: Array<BedCodeRef & { occupied: boolean }>;
  targetBedCount: number;
}): RoomCapacityDecreasePlan {
  const sorted = [...input.activeBeds].sort((a, b) =>
    compareBedCodes(a.bedCode, b.bedCode),
  );
  const toRemove = sorted.length - input.targetBedCount;

  if (toRemove <= 0) {
    return {
      preserveBedIds: sorted.map((b) => b.id),
      archiveBedIds: [],
      archiveBedCodes: [],
      blocked: false,
    };
  }

  const surplusCandidates = [...sorted].reverse().slice(0, toRemove);
  const occupiedSurplus = surplusCandidates.filter((b) => b.occupied);

  if (occupiedSurplus.length > 0) {
    return {
      preserveBedIds: sorted.slice(0, input.targetBedCount).map((b) => b.id),
      archiveBedIds: [],
      archiveBedCodes: [],
      blocked: true,
      blockMessage: `Cannot reduce to ${input.targetBedCount} Sharing. ${occupiedSurplus.length} bed${occupiedSurplus.length === 1 ? '' : 's'} that would be removed ${occupiedSurplus.length === 1 ? 'is' : 'are'} currently occupied. Vacate or resolve those beds first.`,
    };
  }

  return {
    preserveBedIds: sorted.slice(0, input.targetBedCount).map((b) => b.id),
    archiveBedIds: surplusCandidates.map((b) => b.id),
    archiveBedCodes: surplusCandidates.map((b) => b.bedCode),
    blocked: false,
  };
}
