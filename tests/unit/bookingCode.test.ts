import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatBookingCode,
  nextBookingCode,
  parseBookingCode,
  utcYear,
} from '../../src/lib/bookingCode';

describe('formatBookingCode', () => {
  it('zero-pads the sequence to 4 digits', () => {
    assert.equal(formatBookingCode(2026, 1), 'APG-2026-0001');
    assert.equal(formatBookingCode(2026, 42), 'APG-2026-0042');
    assert.equal(formatBookingCode(2026, 9999), 'APG-2026-9999');
  });

  it('handles sequences past 9999 by widening (no truncation)', () => {
    assert.equal(formatBookingCode(2026, 10000), 'APG-2026-10000');
  });
});

describe('nextBookingCode', () => {
  it('returns the next sequence for the year given the current count', () => {
    assert.equal(nextBookingCode(2026, 0), 'APG-2026-0001');
    assert.equal(nextBookingCode(2026, 5), 'APG-2026-0006');
    assert.equal(nextBookingCode(2027, 12), 'APG-2027-0013');
  });
});

describe('parseBookingCode', () => {
  it('round-trips a freshly generated code', () => {
    const code = formatBookingCode(2026, 7);
    const parsed = parseBookingCode(code);
    assert.deepEqual(parsed, { prefix: 'APG', year: 2026, sequence: 7 });
  });

  it('returns null for malformed inputs', () => {
    assert.equal(parseBookingCode('not-a-code'), null);
    assert.equal(parseBookingCode('APG-26-0001'), null); // year must be 4 digits
    assert.equal(parseBookingCode('APG-2026-'), null);
    assert.equal(parseBookingCode(''), null);
  });

  it('tolerates wide sequences', () => {
    assert.deepEqual(parseBookingCode('APG-2026-10001'), {
      prefix: 'APG',
      year: 2026,
      sequence: 10001,
    });
  });
});

describe('utcYear', () => {
  it('extracts the UTC year of a given Date', () => {
    assert.equal(utcYear(new Date(Date.UTC(2030, 5, 1))), 2030);
  });
});
