import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isEditableKeyboardTarget } from '../../../src/capital/lib/keyboardGuards';
import {
  caretAfterIndianFormat,
  countDigitsBefore,
  formatIndianDigitGroup,
  formatRupeesIndian,
  normalizeIndianRupeesTyping,
  parseIndianRupeesInput,
  tryParseIndianRupeesInput,
} from '../../../src/capital/lib/money';

describe('Indian rupee formatting', () => {
  it('formats with Indian grouping', () => {
    assert.equal(formatRupeesIndian(1000), '1,000');
    assert.equal(formatRupeesIndian(10000), '10,000');
    assert.equal(formatRupeesIndian(417300), '4,17,300');
    assert.equal(formatRupeesIndian(532695), '5,32,695');
    assert.equal(formatRupeesIndian(1000000), '10,00,000');
    assert.equal(formatRupeesIndian(1250000), '12,50,000');
    assert.equal(formatRupeesIndian(960000), '9,60,000');
  });

  it('formats digit strings while typing', () => {
    assert.equal(formatIndianDigitGroup('960000'), '9,60,000');
    assert.equal(formatIndianDigitGroup('96000'), '96,000');
    assert.equal(formatIndianDigitGroup('9'), '9');
    assert.equal(formatIndianDigitGroup('00960000'), '9,60,000');
  });

  it('normalizes live typing to Indian display + plain number', () => {
    assert.deepEqual(normalizeIndianRupeesTyping('960000', { allowDecimal: false }), {
      text: '9,60,000',
      value: 960000,
    });
    assert.deepEqual(normalizeIndianRupeesTyping('9,60,000', { allowDecimal: false }), {
      text: '9,60,000',
      value: 960000,
    });
    assert.deepEqual(normalizeIndianRupeesTyping('abc', { allowDecimal: false }), {
      text: '',
      value: undefined,
    });
    assert.deepEqual(normalizeIndianRupeesTyping('-12,500', { allowNegative: true }), {
      text: '-12,500',
      value: -12500,
    });
    assert.equal(
      normalizeIndianRupeesTyping('-12,500', { allowNegative: false }).value,
      undefined,
    );
  });

  it('preserves caret against digit count after reformatting', () => {
    assert.equal(countDigitsBefore('9,60,000', 4), 3); // after "9,60"
    assert.equal(caretAfterIndianFormat('9,60,000', 3), 4);
    assert.equal(caretAfterIndianFormat('9,60,000', 6), 8);
  });

  it('parses Indian-formatted input', () => {
    assert.equal(parseIndianRupeesInput('4,17,300'), 417300);
    assert.equal(parseIndianRupeesInput('₹10,00,000'), 1000000);
    assert.equal(parseIndianRupeesInput(''), undefined);
    assert.equal(tryParseIndianRupeesInput('abc'), undefined);
    assert.equal(tryParseIndianRupeesInput('12.345'), undefined);
  });
});

describe('keyboard editable guard', () => {
  it('treats INPUT-like objects as editable', () => {
    assert.equal(isEditableKeyboardTarget({ tagName: 'INPUT' } as EventTarget), true);
    assert.equal(isEditableKeyboardTarget({ tagName: 'TEXTAREA' } as EventTarget), true);
    assert.equal(
      isEditableKeyboardTarget({ tagName: 'DIV', isContentEditable: false } as EventTarget),
      false,
    );
  });
});
