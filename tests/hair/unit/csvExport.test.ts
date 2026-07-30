import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { escapeCsvCell, paiseToCsvRupees, rowsToCsv } from '@/src/hair/lib/export/csv';

describe('hair csv export', () => {
  it('escapes commas and quotes', () => {
    assert.equal(escapeCsvCell('hello'), 'hello');
    assert.equal(escapeCsvCell('a,b'), '"a,b"');
    assert.equal(escapeCsvCell('say "hi"'), '"say ""hi"""');
  });

  it('formats paise as rupees', () => {
    assert.equal(paiseToCsvRupees(12345), '123.45');
  });

  it('builds csv with header row', () => {
    const csv = rowsToCsv(['A', 'B'], [['x', 1]]);
    assert.equal(csv, 'A,B\nx,1');
  });
});
