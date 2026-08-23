import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  inrInputToWords,
  integerRupeesToWords,
  paiseToIndianWords,
  rupeesToIndianWords,
} from '@/src/lib/money/inrToWords';

describe('rupeesToIndianWords — required fixtures', () => {
  test('₹0', () => {
    assert.equal(rupeesToIndianWords(0), 'Rupees Zero Only');
  });

  test('₹1', () => {
    assert.equal(rupeesToIndianWords(1), 'Rupees One Only');
  });

  test('₹99', () => {
    assert.equal(rupeesToIndianWords(99), 'Rupees Ninety Nine Only');
  });

  test('₹1,000', () => {
    assert.equal(rupeesToIndianWords(1000), 'Rupees One Thousand Only');
  });

  test('₹10,000', () => {
    assert.equal(rupeesToIndianWords(10_000), 'Rupees Ten Thousand Only');
  });

  test('₹1,00,000', () => {
    assert.equal(rupeesToIndianWords(100_000), 'Rupees One Lakh Only');
  });

  test('₹10,00,000', () => {
    assert.equal(rupeesToIndianWords(1_000_000), 'Rupees Ten Lakh Only');
  });

  test('₹1,00,00,000', () => {
    assert.equal(rupeesToIndianWords(10_000_000), 'Rupees One Crore Only');
  });

  test('₹1,13,00,000', () => {
    assert.equal(rupeesToIndianWords(11_300_000), 'Rupees One Crore Thirteen Lakh Only');
  });

  test('₹11,30,00,000', () => {
    assert.equal(rupeesToIndianWords(113_000_000), 'Rupees Eleven Crore Thirty Lakh Only');
  });

  test('₹1,500.50', () => {
    assert.equal(
      rupeesToIndianWords(1500.5),
      'Rupees One Thousand Five Hundred and Fifty Paise Only',
    );
  });

  test('₹1,00,000.75', () => {
    assert.equal(rupeesToIndianWords(100_000.75), 'Rupees One Lakh and Seventy Five Paise Only');
  });

  test('negative amount', () => {
    assert.equal(rupeesToIndianWords(-500_000), 'Negative Rupees Five Lakh Only');
  });

  test('empty input', () => {
    assert.equal(inrInputToWords(''), null);
    assert.equal(inrInputToWords('   '), null);
    assert.equal(inrInputToWords('₹'), null);
    assert.equal(inrInputToWords('-'), null);
  });

  test('invalid input', () => {
    assert.equal(inrInputToWords('abc'), null);
    assert.equal(inrInputToWords('12a'), null);
    assert.equal(inrInputToWords('1.234'), null);
    assert.equal(inrInputToWords('1e5'), null);
    assert.equal(inrInputToWords('--1'), null);
  });
});

describe('inrInputToWords — live valuation typing', () => {
  test('updates words as the user types 11300000', () => {
    const sequence: Array<[string, string]> = [
      ['1', 'Rupees One Only'],
      ['11', 'Rupees Eleven Only'],
      ['113', 'Rupees One Hundred Thirteen Only'],
      ['1130', 'Rupees One Thousand One Hundred Thirty Only'],
      ['11300', 'Rupees Eleven Thousand Three Hundred Only'],
      ['113000', 'Rupees One Lakh Thirteen Thousand Only'],
      ['1130000', 'Rupees Eleven Lakh Thirty Thousand Only'],
      ['11300000', 'Rupees One Crore Thirteen Lakh Only'],
    ];
    for (const [typed, expected] of sequence) {
      assert.equal(inrInputToWords(typed), expected, `typed ${typed}`);
    }
  });

  test('accepts Indian-grouped and rupee-prefixed input', () => {
    assert.equal(inrInputToWords('1,13,00,000'), 'Rupees One Crore Thirteen Lakh Only');
    assert.equal(inrInputToWords('₹11300000'), 'Rupees One Crore Thirteen Lakh Only');
  });

  test('zero typed shows Zero; blank does not', () => {
    assert.equal(inrInputToWords('0'), 'Rupees Zero Only');
    assert.equal(inrInputToWords(''), null);
  });
});

describe('paiseToIndianWords', () => {
  test('matches rupee conversion including leftover paise', () => {
    assert.equal(paiseToIndianWords(0), 'Rupees Zero Only');
    assert.equal(paiseToIndianWords(100), 'Rupees One Only');
    assert.equal(
      paiseToIndianWords(150050),
      'Rupees One Thousand Five Hundred and Fifty Paise Only',
    );
    assert.equal(paiseToIndianWords(-50_000_000), 'Negative Rupees Five Lakh Only');
  });
});

describe('integerRupeesToWords — extra Indian grouping', () => {
  test('does not use million or billion', () => {
    const words = integerRupeesToWords(1_500_000_000);
    assert.equal(words.includes('Million'), false);
    assert.equal(words.includes('Billion'), false);
    assert.match(words, /Crore/);
  });

  test('₹1,500 and ₹25,000', () => {
    assert.equal(rupeesToIndianWords(1500), 'Rupees One Thousand Five Hundred Only');
    assert.equal(rupeesToIndianWords(25_000), 'Rupees Twenty Five Thousand Only');
  });

  test('non-finite yields empty / null', () => {
    assert.equal(rupeesToIndianWords(Number.NaN), '');
    assert.equal(rupeesToIndianWords(Number.POSITIVE_INFINITY), '');
    assert.equal(inrInputToWords('NaN'), null);
  });
});
