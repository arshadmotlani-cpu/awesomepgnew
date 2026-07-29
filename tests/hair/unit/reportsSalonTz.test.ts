import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  salonDayBounds,
  salonMonthStartUtc,
  salonWeekStartUtc,
} from '@/src/hair/lib/salonTime';

describe('reports salon timezone bounds', () => {
  it('week start is Monday 00:00 in Asia/Kolkata', () => {
    // Wed 2026-07-29 18:00 UTC → Thu morning IST; week should start Mon 2026-07-28 IST
    const now = new Date('2026-07-29T06:30:00.000Z');
    const tz = 'Asia/Kolkata';
    const weekStart = salonWeekStartUtc(tz, now);
    const { dayKey } = salonDayBounds(tz, weekStart);
    assert.equal(dayKey, '2026-07-27');
  });

  it('month start uses salon calendar month', () => {
    const now = new Date('2026-07-15T12:00:00.000Z');
    const monthStart = salonMonthStartUtc('Asia/Kolkata', now);
    const { dayKey } = salonDayBounds('Asia/Kolkata', monthStart);
    assert.equal(dayKey, '2026-07-01');
  });
});
