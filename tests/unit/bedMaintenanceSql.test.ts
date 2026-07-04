import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

describe('bedMaintenance assertBedHasNoActiveOccupant SQL', () => {
  test('occupancy SSOT uses bk/br aliases — not unaliased Drizzle join', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../src/services/bedMaintenance.ts', import.meta.url), 'utf8'),
    );
    assert.doesNotMatch(source, /occupancyReservationCoreSql/);
    assert.match(source, /bed_reservations br/);
    assert.match(source, /bookings bk/);
  });
});
