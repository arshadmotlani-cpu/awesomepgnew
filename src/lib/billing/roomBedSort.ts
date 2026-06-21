/**
 * Natural sort for room numbers and bed codes (B1, B2, … B10).
 */

function numericPrefix(value: string): number | null {
  const m = value.trim().match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

function bedSortKey(bedCode: string): number {
  const m = bedCode.trim().match(/^B(\d+)/i);
  return m ? Number(m[1]) : 9999;
}

export function compareRoomBedOrder(
  a: { roomNumber: string; bedCode: string },
  b: { roomNumber: string; bedCode: string },
): number {
  const roomA = numericPrefix(a.roomNumber) ?? Number.MAX_SAFE_INTEGER;
  const roomB = numericPrefix(b.roomNumber) ?? Number.MAX_SAFE_INTEGER;
  if (roomA !== roomB) return roomA - roomB;

  const roomText = a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
  if (roomText !== 0) return roomText;

  const bedA = bedSortKey(a.bedCode);
  const bedB = bedSortKey(b.bedCode);
  if (bedA !== bedB) return bedA - bedB;

  return a.bedCode.localeCompare(b.bedCode, undefined, { numeric: true });
}

export function sortByRoomBed<T extends { roomNumber: string; bedCode: string }>(rows: T[]): T[] {
  return [...rows].sort(compareRoomBedOrder);
}

/** Group consecutive rows by room number for display. */
export function groupRowsByRoom<T extends { roomNumber: string }>(
  rows: T[],
): Array<{ roomNumber: string; residents: T[] }> {
  const sorted = sortByRoomBed(rows as Array<T & { bedCode: string }>);
  const groups: Array<{ roomNumber: string; residents: T[] }> = [];
  for (const row of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.roomNumber === row.roomNumber) {
      last.residents.push(row);
    } else {
      groups.push({ roomNumber: row.roomNumber, residents: [row] });
    }
  }
  return groups;
}
