import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  BED_OCCUPIED_MESSAGE,
  BED_STATUS_SAVE_ERROR,
  sanitizeBedStatusError,
} from '@/src/lib/bedOccupancyCheck';

describe('bedOccupancyCheck SSOT', () => {
  test('occupancy SQL lives in one module with br/bk aliases', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/lib/bedOccupancyCheck.ts'),
      'utf8',
    );
    assert.match(source, /bed_reservations br/);
    assert.match(source, /bookings bk/);
    assert.match(source, /CURRENT_DATE <@ br\.stay_range/);
  });

  test('bedMaintenance uses shared helper — no duplicate occupancy SQL', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/services/bedMaintenance.ts'),
      'utf8',
    );
    assert.match(source, /assertBedNotOccupiedToday/);
    assert.doesNotMatch(source, /bed_reservations br/);
    assert.doesNotMatch(source, /FROM bed_reservations/);
  });

  test('reconcileBedForAdminMark does not use Drizzle bed_reservations↔bookings joins', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/services/bookingAdminOps.ts'),
      'utf8',
    );
    assert.match(source, /listUnpaidHoldReservations/);
    assert.match(source, /findBlockingConfirmedBooking/);
    assert.doesNotMatch(
      source,
      /\.from\(bedReservations\)\s*\n\s*\.innerJoin\(bookings,/,
    );
  });

  test('sanitizeBedStatusError hides raw SQL failures', () => {
    const err = new Error(
      'Failed query: select bookings.id from bed_reservations inner join bookings on ...',
    );
    assert.equal(sanitizeBedStatusError(err), BED_STATUS_SAVE_ERROR);
    assert.equal(sanitizeBedStatusError(new Error(BED_OCCUPIED_MESSAGE)), BED_OCCUPIED_MESSAGE);
  });
});
