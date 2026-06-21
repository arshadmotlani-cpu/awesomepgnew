import { addDays, diffDays, formatDate } from '@/src/lib/dates';
import { formatDate as formatDisplayDate } from '@/src/lib/format';
import { isResidentBedAssignable } from '@/src/lib/residentBedAssignment';
import type { OccupancyByPg } from '@/src/db/queries/admin';
import type { PgBedMap, PgBedMapBed, PgBedMapRoom } from '@/src/services/pgBedMap';
import type { ResidentListRow, UnverifiedWebsiteSignupRow } from '@/src/services/residentAdmin';

export type AssignableBedRow = {
  bedId: string;
  bedCode: string;
  roomId: string;
  roomNumber: string;
  pgId: string;
  pgName: string;
  manualOccupied: boolean;
  monthlyRatePaise: number;
  depositPaise: number;
};

export type BedAssignmentCommandStats = {
  freeBedsNow: number;
  releasingWithin7Days: number;
  waitingAssignments: number;
  occupancyPct: number;
  roomsWithOneBedLeft: number;
};

export type BedAssignmentQueueCategory = 'waiting' | 'transfer' | 'returning' | 'special';

export type BedAssignmentQueueItem = {
  id: string;
  category: BedAssignmentQueueCategory;
  categoryLabel: string;
  residentName: string;
  customerId: string;
  bookingCode: string | null;
  bookingId: string | null;
  preferredPg: string | null;
  recommendedBedId: string | null;
  recommendedBedLabel: string | null;
  recommendedPgId: string | null;
  reason: string;
  nextAction: string;
  sortPriority: number;
};

export type BedRoomRecommendation = {
  id: string;
  kind: 'fill_next' | 'nearly_full' | 'empty' | 'upcoming_vacancy';
  kindLabel: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  roomId: string;
  bedId: string | null;
  bedCode: string | null;
  headline: string;
  detail: string;
  sortPriority: number;
};

export type PgAvailabilityRow = {
  pgId: string;
  pgName: string;
  freeBeds: number;
  releasingSoon: number;
  occupancyPct: number;
  waitingCount: number;
};

const CATEGORY_ORDER: Record<BedAssignmentQueueCategory, number> = {
  waiting: 0,
  transfer: 1,
  returning: 2,
  special: 3,
};

const CATEGORY_LABEL: Record<BedAssignmentQueueCategory, string> = {
  waiting: 'Waiting assignment',
  transfer: 'Bed transfer / move-out',
  returning: 'Reserved move-in',
  special: 'Special case',
};

function todayIso(): string {
  return formatDate(new Date());
}

function isReleasingWithinDays(bed: PgBedMapBed, days: number): boolean {
  if (!bed.vacating?.vacatingDate) return false;
  const until = diffDays(todayIso(), bed.vacating.vacatingDate);
  return until >= 0 && until <= days;
}

function roomOccupiedCount(room: PgBedMapRoom): number {
  return room.beds.filter((b) => b.isOccupiedToday || b.manualOccupied).length;
}

export function recommendBedForResident(
  preferredPg: string | null,
  assignable: AssignableBedRow[],
  maps: PgBedMap[],
): AssignableBedRow | null {
  if (assignable.length === 0) return null;

  const pool = preferredPg
    ? assignable.filter((b) => b.pgName === preferredPg)
    : assignable;
  const candidates = pool.length > 0 ? pool : assignable;

  const roomFill = new Map<string, { fill: number; capacity: number }>();
  for (const map of maps) {
    for (const floor of map.floors) {
      for (const room of floor.rooms) {
        const cap = room.beds.length;
        const fill = roomOccupiedCount(room);
        roomFill.set(room.roomId, { fill, capacity: cap });
      }
    }
  }

  let best: AssignableBedRow | null = null;
  let bestScore = -1;

  for (const bed of candidates) {
    const rf = roomFill.get(bed.roomId);
    const fillRatio = rf && rf.capacity > 0 ? rf.fill / rf.capacity : 0;
    const score = fillRatio * 100 + (rf?.fill === rf!.capacity - 1 ? 50 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = bed;
    }
  }

  return best ?? candidates[0] ?? null;
}

export function buildBedAssignmentCommand(input: {
  occupancy: OccupancyByPg[];
  maps: PgBedMap[];
  residents: ResidentListRow[];
  assignable: AssignableBedRow[];
  unverified: UnverifiedWebsiteSignupRow[];
}): {
  stats: BedAssignmentCommandStats;
  queue: BedAssignmentQueueItem[];
  recommendations: BedRoomRecommendation[];
  pgRows: PgAvailabilityRow[];
} {
  const today = todayIso();
  const weekEnd = formatDate(addDays(today, 7));

  let freeBedsNow = 0;
  let releasingWithin7Days = 0;
  let roomsWithOneBedLeft = 0;
  let totalBeds = 0;
  let occupiedBeds = 0;

  const recommendations: BedRoomRecommendation[] = [];

  for (const map of input.maps) {
    for (const floor of map.floors) {
      for (const room of floor.rooms) {
        const cap = room.beds.length;
        const occupied = roomOccupiedCount(room);
        const open = room.beds.filter((b) => b.isAvailableNow).length;

        totalBeds += cap;
        occupiedBeds += occupied;

        if (open === 1 && cap > 1) roomsWithOneBedLeft += 1;

        for (const bed of room.beds) {
          if (bed.isAvailableNow) freeBedsNow += 1;
          if (isReleasingWithinDays(bed, 7)) releasingWithin7Days += 1;

          if (bed.vacating?.status === 'approved' && bed.vacating.vacatingDate <= weekEnd) {
            recommendations.push({
              id: `vacancy-${bed.bedId}`,
              kind: 'upcoming_vacancy',
              kindLabel: 'Releasing soon',
              pgId: map.pgId,
              pgName: input.occupancy.find((p) => p.pgId === map.pgId)?.pgName ?? 'PG',
              roomNumber: room.roomNumber,
              roomId: room.roomId,
              bedId: bed.bedId,
              bedCode: bed.bedCode,
              headline: `R${room.roomNumber} · ${bed.bedCode} frees ${formatDisplayDate(bed.vacating.vacatingDate)}`,
              detail: bed.occupant?.customerName ?? 'Occupied',
              sortPriority: diffDays(today, bed.vacating.vacatingDate),
            });
          }
        }

        if (open > 0 && occupied > 0 && occupied >= cap - 1) {
          const openBed = room.beds.find((b) => b.isAvailableNow);
          recommendations.push({
            id: `fill-${room.roomId}`,
            kind: 'fill_next',
            kindLabel: 'Best to fill next',
            pgId: map.pgId,
            pgName: input.occupancy.find((p) => p.pgId === map.pgId)?.pgName ?? 'PG',
            roomNumber: room.roomNumber,
            roomId: room.roomId,
            bedId: openBed?.bedId ?? null,
            bedCode: openBed?.bedCode ?? null,
            headline: `R${room.roomNumber} — ${open} bed left`,
            detail: `${occupied}/${cap} filled · assign here to complete the room`,
            sortPriority: 0,
          });
        } else if (occupied === 0 && cap > 0) {
          const openBed = room.beds.find((b) => b.isAvailableNow);
          recommendations.push({
            id: `empty-${room.roomId}`,
            kind: 'empty',
            kindLabel: 'Empty room',
            pgId: map.pgId,
            pgName: input.occupancy.find((p) => p.pgId === map.pgId)?.pgName ?? 'PG',
            roomNumber: room.roomNumber,
            roomId: room.roomId,
            bedId: openBed?.bedId ?? null,
            bedCode: openBed?.bedCode ?? null,
            headline: `R${room.roomNumber} — all ${cap} beds open`,
            detail: 'Start filling this room',
            sortPriority: 2,
          });
        } else if (cap > 1 && occupied > 0 && occupied / cap >= 0.66) {
          recommendations.push({
            id: `nearly-${room.roomId}`,
            kind: 'nearly_full',
            kindLabel: 'Nearly full',
            pgId: map.pgId,
            pgName: input.occupancy.find((p) => p.pgId === map.pgId)?.pgName ?? 'PG',
            roomNumber: room.roomNumber,
            roomId: room.roomId,
            bedId: room.beds.find((b) => b.isAvailableNow)?.bedId ?? null,
            bedCode: room.beds.find((b) => b.isAvailableNow)?.bedCode ?? null,
            headline: `R${room.roomNumber} — ${occupied}/${cap} occupied`,
            detail: `${open} bed${open === 1 ? '' : 's'} still open`,
            sortPriority: 1,
          });
        }
      }
    }
  }

  const queue: BedAssignmentQueueItem[] = [];

  for (const r of input.residents.filter((x) => isResidentBedAssignable(x))) {
    const rec = recommendBedForResident(r.pgName, input.assignable, input.maps);
    queue.push({
      id: `wait-${r.id}`,
      category: 'waiting',
      categoryLabel: CATEGORY_LABEL.waiting,
      residentName: r.fullName,
      customerId: r.id,
      bookingCode: r.bookingCode,
      bookingId: r.bookingId,
      preferredPg: r.pgName,
      recommendedBedId: rec?.bedId ?? null,
      recommendedBedLabel: rec ? `${rec.pgName} · R${rec.roomNumber} · ${rec.bedCode}` : null,
      recommendedPgId: rec?.pgId ?? null,
      reason: 'Verified resident with no bed assigned',
      nextAction: rec ? 'Assign recommended bed' : 'Pick any open bed on the map',
      sortPriority: 0,
    });
  }

  for (const r of input.residents.filter((x) => x.tenancyStatus === 'vacating')) {
    queue.push({
      id: `xfer-${r.id}`,
      category: 'transfer',
      categoryLabel: CATEGORY_LABEL.transfer,
      residentName: r.fullName,
      customerId: r.id,
      bookingCode: r.bookingCode,
      bookingId: r.bookingId,
      preferredPg: r.pgName,
      recommendedBedId: r.bedId,
      recommendedBedLabel: r.pgName && r.roomNumber && r.bedCode
        ? `${r.pgName} · R${r.roomNumber} · ${r.bedCode}`
        : null,
      recommendedPgId: r.pgId,
      reason: 'Move-out in progress — bed will open after checkout',
      nextAction: 'Complete checkout or manage on bed map',
      sortPriority: 1,
    });
  }

  for (const map of input.maps) {
    for (const floor of map.floors) {
      for (const room of floor.rooms) {
        for (const bed of room.beds) {
          if (bed.reserved && !bed.occupant) {
            queue.push({
              id: `ret-${bed.bedId}`,
              category: 'returning',
              categoryLabel: CATEGORY_LABEL.returning,
              residentName: bed.reserved.customerName,
              customerId: bed.reserved.customerId,
              bookingCode: bed.reserved.bookingCode,
              bookingId: bed.reserved.bookingId,
              preferredPg: input.occupancy.find((p) => p.pgId === map.pgId)?.pgName ?? null,
              recommendedBedId: bed.bedId,
              recommendedBedLabel: `R${room.roomNumber} · ${bed.bedCode}`,
              recommendedPgId: map.pgId,
              reason: `Reserved move-in ${bed.reservedFrom ? formatDisplayDate(bed.reservedFrom) : 'pending'}`,
              nextAction: 'Activate reservation when resident arrives',
              sortPriority: 2,
            });
          }
          if (bed.manualOccupied && !bed.occupant && bed.isAvailableNow) {
            queue.push({
              id: `spec-${bed.bedId}`,
              category: 'special',
              categoryLabel: CATEGORY_LABEL.special,
              residentName: '—',
              customerId: '',
              bookingCode: null,
              bookingId: null,
              preferredPg: input.occupancy.find((p) => p.pgId === map.pgId)?.pgName ?? null,
              recommendedBedId: bed.bedId,
              recommendedBedLabel: `R${room.roomNumber} · ${bed.bedCode}`,
              recommendedPgId: map.pgId,
              reason: 'Marked occupied on website but no tenant assigned',
              nextAction: 'Assign tenant or clear manual mark',
              sortPriority: 3,
            });
          }
        }
      }
    }
  }

  for (const u of input.unverified.filter((x) => x.bookingId && !x.bedId)) {
    queue.push({
      id: `spec-u-${u.id}`,
      category: 'special',
      categoryLabel: CATEGORY_LABEL.special,
      residentName: u.fullName,
      customerId: u.id,
      bookingCode: u.bookingCode,
      bookingId: u.bookingId,
      preferredPg: u.pgName,
      recommendedBedId: null,
      recommendedBedLabel: null,
      recommendedPgId: u.pgId,
      reason: 'Unverified signup with booking — approve KYC or payment first',
      nextAction: 'Verify identity or payment, then assign bed',
      sortPriority: 4,
    });
  }

  queue.sort((a, b) => {
    const c = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
    if (c !== 0) return c;
    return a.sortPriority - b.sortPriority;
  });

  recommendations.sort((a, b) => a.sortPriority - b.sortPriority);

  const waitingAssignments = queue.filter((q) => q.category === 'waiting').length;

  const pgRows: PgAvailabilityRow[] = input.occupancy.map((pg) => {
    const map = input.maps.find((m) => m.pgId === pg.pgId);
    let releasingSoon = 0;
    if (map) {
      for (const floor of map.floors) {
        for (const room of floor.rooms) {
          for (const bed of room.beds) {
            if (isReleasingWithinDays(bed, 7)) releasingSoon += 1;
          }
        }
      }
    }
    return {
      pgId: pg.pgId,
      pgName: pg.pgName,
      freeBeds: map?.summary.openNowBeds ?? pg.availableBeds,
      releasingSoon,
      occupancyPct: pg.occupancyPct,
      waitingCount: queue.filter(
        (q) => q.category === 'waiting' && q.preferredPg === pg.pgName,
      ).length,
    };
  });

  pgRows.sort((a, b) => b.freeBeds - a.freeBeds);

  return {
    stats: {
      freeBedsNow,
      releasingWithin7Days,
      waitingAssignments,
      occupancyPct: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 10) / 10 : 0,
      roomsWithOneBedLeft,
    },
    queue,
    recommendations: recommendations.slice(0, 12),
    pgRows,
  };
}

export function queueCategorySectionLabel(category: BedAssignmentQueueCategory): string {
  return CATEGORY_LABEL[category];
}

export function buildAssignBedHref(input: {
  pgId: string | null;
  bedId: string | null;
  customerId: string;
}): string {
  const params = new URLSearchParams();
  if (input.pgId) params.set('pgId', input.pgId);
  if (input.bedId) params.set('bedId', input.bedId);
  if (input.customerId) params.set('customerId', input.customerId);
  return `/admin/beds?${params.toString()}`;
}
