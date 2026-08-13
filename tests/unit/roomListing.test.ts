import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeRoomArea,
  formatRoomArea,
  parseMediaUrlList,
  parseRoomDimensions,
} from '../../src/lib/roomListing';

describe('room listing helpers', () => {
  it('parses dimensions with defaults', () => {
    assert.deepEqual(parseRoomDimensions({}), {});
    assert.deepEqual(parseRoomDimensions({ length: 10, width: 12, unit: 'ft' }), {
      length: 10,
      width: 12,
      unit: 'ft',
    });
  });

  it('computes floor area from length and width', () => {
    assert.equal(computeRoomArea({ length: 10, width: 12, unit: 'ft' }), 120);
    assert.equal(formatRoomArea({ length: 10, width: 12, unit: 'ft' }), '120 sq ft');
    assert.equal(formatRoomArea({ length: 4, width: 5, unit: 'm' }), '20 sq m');
    assert.equal(computeRoomArea({ length: 0, width: 5 }), null);
  });

  it('parses media url lists', () => {
    assert.deepEqual(parseMediaUrlList(['https://a.jpg', '', 1]), ['https://a.jpg']);
  });
});
