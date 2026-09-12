/**
 * Client-safe preview for room type / capacity changes.
 */
import {
  compareBedCodes,
  planRoomCapacityDecrease,
  planRoomCapacityIncrease,
  sortBedCodes,
} from '@/src/lib/roomCapacityBedPlanner';

export type RoomCapacityPreviewBed = {
  bedCode: string;
  bedId?: string;
  status: 'available' | 'maintenance' | 'blocked';
  occupied: boolean;
};

export type RoomCapacityPreviewLine = {
  bedCode: string;
  kind: 'existing' | 'reactivate' | 'create' | 'archive';
  statusLabel: string;
};

export type RoomCapacityChangePreview = {
  targetBedCount: number;
  targetLabel: string;
  lines: RoomCapacityPreviewLine[];
  monthlyRatePaise: number;
  blocked: boolean;
  blockMessage?: string;
};

export function buildRoomCapacityChangePreview(input: {
  currentBeds: RoomCapacityPreviewBed[];
  archivedBedCodes: string[];
  targetBedCount: number;
  targetLabel: string;
  monthlyRatePaise: number;
}): RoomCapacityChangePreview {
  const activeRefs = input.currentBeds.map((b, i) => ({
    id: b.bedId ?? `active-${i}`,
    bedCode: b.bedCode,
    occupied: b.occupied,
  }));

  const statusLabel = (bed: RoomCapacityPreviewBed): string => {
    if (bed.occupied) return 'Occupied';
    if (bed.status === 'maintenance') return 'Maintenance';
    if (bed.status === 'blocked') return 'Blocked';
    return 'Available';
  };

  if (input.targetBedCount === input.currentBeds.length) {
    return {
      targetBedCount: input.targetBedCount,
      targetLabel: input.targetLabel,
      monthlyRatePaise: input.monthlyRatePaise,
      blocked: false,
      lines: sortBedCodes(input.currentBeds.map((b) => b.bedCode)).map((code) => {
        const bed = input.currentBeds.find((b) => b.bedCode === code)!;
        return { bedCode: code, kind: 'existing' as const, statusLabel: statusLabel(bed) };
      }),
    };
  }

  if (input.targetBedCount < input.currentBeds.length) {
    const decrease = planRoomCapacityDecrease({
      activeBeds: activeRefs,
      targetBedCount: input.targetBedCount,
    });
    const archiveSet = new Set(decrease.archiveBedCodes);
    const lines: RoomCapacityPreviewLine[] = sortBedCodes(
      input.currentBeds.map((b) => b.bedCode),
    ).map((code) => {
      const bed = input.currentBeds.find((b) => b.bedCode === code)!;
      if (archiveSet.has(code)) {
        return { bedCode: code, kind: 'archive' as const, statusLabel: `${statusLabel(bed)} · will be archived` };
      }
      return { bedCode: code, kind: 'existing' as const, statusLabel: statusLabel(bed) };
    });

    return {
      targetBedCount: input.targetBedCount,
      targetLabel: input.targetLabel,
      monthlyRatePaise: input.monthlyRatePaise,
      blocked: decrease.blocked,
      blockMessage: decrease.blockMessage,
      lines,
    };
  }

  const archivedRefs = input.archivedBedCodes.map((code, i) => ({
    id: `archived-${code}-${i}`,
    bedCode: code,
  }));

  const increase = planRoomCapacityIncrease({
    activeBeds: activeRefs.map(({ id, bedCode }) => ({ id, bedCode })),
    archivedBeds: archivedRefs,
    bedsToAdd: input.targetBedCount - input.currentBeds.length,
  });

  const reactivateSet = new Set(increase.reactivatedBedCodes);
  const createSet = new Set(increase.createBedCodes);

  const lines: RoomCapacityPreviewLine[] = [];

  for (const code of sortBedCodes(input.currentBeds.map((b) => b.bedCode))) {
    const bed = input.currentBeds.find((b) => b.bedCode === code)!;
    lines.push({ bedCode: code, kind: 'existing', statusLabel: statusLabel(bed) });
  }

  for (const code of sortBedCodes([...reactivateSet, ...createSet])) {
    if (reactivateSet.has(code)) {
      lines.push({ bedCode: code, kind: 'reactivate', statusLabel: 'Will be restored' });
    } else if (createSet.has(code)) {
      lines.push({ bedCode: code, kind: 'create', statusLabel: 'Will be created' });
    }
  }

  return {
    targetBedCount: input.targetBedCount,
    targetLabel: input.targetLabel,
    monthlyRatePaise: input.monthlyRatePaise,
    blocked: false,
    lines,
  };
}
