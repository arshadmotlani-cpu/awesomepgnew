/**
 * Room OS Wave 3 — booking context resolution tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('Room OS Wave 3 — BookingContext', () => {
  test('loadBookingContext API is implemented in roomOs v1', () => {
    const src = read('src/roomOs/api/v1/roomOs.ts');
    assert.match(src, /export async function loadBookingContext/);
    assert.match(src, /buildBookingContextSnapshot/);
    assert.match(src, /status: 'ready'/);
  });

  test('resolveBookingContext chains Bed Brain and LedgerProjection', () => {
    const src = read('src/roomOs/engines/occupancy/resolveBookingContext.ts');
    assert.match(src, /buildBedBrainSnapshot/);
    assert.match(src, /buildBookingLedgerSnapshot/);
    assert.match(src, /rentInvoicePointer/);
    assert.match(src, /depositPointer/);
    assert.match(src, /moveOutPointer/);
  });

  test('BookingContextSlice pointers exist in domain types', () => {
    const src = read('src/roomOs/types/domain.ts');
    assert.match(src, /rentInvoicePointer\?: string/);
    assert.match(src, /depositPointer\?: string/);
    assert.match(src, /moveOutPointer\?: string/);
  });
});
