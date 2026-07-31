import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { paiseToIndianWords } from '@/src/hair/lib/amountInWords';

describe('paiseToIndianWords', () => {
  it('converts round rupee amounts', () => {
    assert.equal(paiseToIndianWords(0), 'Rupees Zero Only');
    assert.equal(paiseToIndianWords(100), 'Rupees One Only');
    assert.equal(paiseToIndianWords(118000), 'Rupees One Thousand One Hundred Eighty Only');
    assert.equal(paiseToIndianWords(10000000), 'Rupees One Lakh Only');
  });

  it('rounds paise to nearest rupee', () => {
    assert.equal(paiseToIndianWords(150), 'Rupees Two Only');
    assert.equal(paiseToIndianWords(149), 'Rupees One Only');
  });
});
