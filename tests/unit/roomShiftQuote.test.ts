import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_SHIFT_FEE_PAISE } from '@/src/services/roomShiftQuote';

test('room shift fee is ₹100', () => {
  assert.equal(ROOM_SHIFT_FEE_PAISE, 10_000);
});
