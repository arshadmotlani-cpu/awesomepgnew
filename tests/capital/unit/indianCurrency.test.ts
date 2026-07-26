import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isEditableKeyboardTarget } from '../../../src/capital/lib/keyboardGuards';
import {
  formatRupeesIndian,
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
