/**
 * Pure appointment scheduling helpers — conflict + working hours.
 * Kept free of DB so unit tests can cover the engine.
 */

export type Interval = { startMs: number; endMs: number };

export function intervalsOverlap(
  a: Interval,
  b: Interval,
  bufferMinutes = 0,
): boolean {
  const buf = Math.max(0, bufferMinutes) * 60_000;
  return a.startMs < b.endMs + buf && b.startMs < a.endMs + buf;
}

export function parseHmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function isWithinWorkingWindow(input: {
  startAt: Date;
  endAt: Date;
  openHm: string;
  closeHm: string;
  lunchStartHm?: string | null;
  lunchEndHm?: string | null;
  closed?: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (input.closed) return { ok: false, reason: 'Salon or stylist is off this day' };
  if (input.endAt <= input.startAt) return { ok: false, reason: 'End time must be after start' };

  const startMin =
    input.startAt.getHours() * 60 + input.startAt.getMinutes();
  const endMin = input.endAt.getHours() * 60 + input.endAt.getMinutes();
  const open = parseHmToMinutes(input.openHm);
  const close = parseHmToMinutes(input.closeHm);
  if (startMin < open || endMin > close) {
    return { ok: false, reason: 'Outside working hours' };
  }
  if (input.lunchStartHm && input.lunchEndHm) {
    const ls = parseHmToMinutes(input.lunchStartHm);
    const le = parseHmToMinutes(input.lunchEndHm);
    if (intervalsOverlap(
      { startMs: startMin, endMs: endMin },
      { startMs: ls, endMs: le },
      0,
    )) {
      return { ok: false, reason: 'Overlaps lunch break' };
    }
  }
  return { ok: true };
}

export function findConflict(
  candidate: Interval,
  existing: Array<Interval & { id: string }>,
  bufferMinutes: number,
  excludeId?: string,
): string | null {
  for (const row of existing) {
    if (excludeId && row.id === excludeId) continue;
    if (intervalsOverlap(candidate, row, bufferMinutes)) return row.id;
  }
  return null;
}
