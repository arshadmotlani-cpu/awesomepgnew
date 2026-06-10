import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatIndianPhoneDisplay,
  indianLocalFromE164,
  indianPhonesEqual,
  normaliseIndianPhone,
  normalisePhone,
} from '../../src/lib/phone';

describe('normalisePhone', () => {
  it('accepts a clean E.164 number unchanged', () => {
    assert.equal(normalisePhone('+919876543210'), '+919876543210');
  });

  it('strips spaces and punctuation', () => {
    assert.equal(normalisePhone('+91 98765-43210'), '+919876543210');
    assert.equal(normalisePhone('+91 (987) 654-3210'), '+919876543210');
  });

  it('accepts E.164 without the leading +', () => {
    assert.equal(normalisePhone('919876543210'), '919876543210');
  });

  it('drops embedded + signs but keeps a leading one', () => {
    assert.equal(normalisePhone('+91+98765+43210'), '+919876543210');
  });

  it('returns null for empty / null / undefined', () => {
    assert.equal(normalisePhone(''), null);
    assert.equal(normalisePhone(null), null);
    assert.equal(normalisePhone(undefined), null);
  });

  it('returns null for too-short numbers', () => {
    assert.equal(normalisePhone('+91123'), null);
  });

  it('returns null for too-long numbers (>15 digits)', () => {
    assert.equal(normalisePhone('+1234567890123456'), null);
  });

  it('returns null when the first digit is 0', () => {
    assert.equal(normalisePhone('+0919876543210'), null);
  });

  it('returns null for non-digit garbage', () => {
    assert.equal(normalisePhone('not a phone'), null);
  });
});

describe('normaliseIndianPhone', () => {
  it('accepts 10-digit local mobile and returns +91 E.164', () => {
    assert.equal(normaliseIndianPhone('9876543210'), '+919876543210');
  });

  it('accepts 12-digit with 91 prefix', () => {
    assert.equal(normaliseIndianPhone('919876543210'), '+919876543210');
  });

  it('accepts existing stored E.164 +91 numbers', () => {
    assert.equal(normaliseIndianPhone('+919876543210'), '+919876543210');
    assert.equal(normaliseIndianPhone('+91 98765 43210'), '+919876543210');
  });

  it('rejects numbers not starting with 6–9', () => {
    assert.equal(normaliseIndianPhone('5876543210'), null);
    assert.equal(normaliseIndianPhone('1234567890'), null);
  });

  it('rejects wrong length', () => {
    assert.equal(normaliseIndianPhone('987654321'), null);
    assert.equal(normaliseIndianPhone('98765432101'), null);
  });

  it('rejects non-Indian E.164', () => {
    assert.equal(normaliseIndianPhone('+14155552671'), null);
  });
});

describe('indianPhonesEqual', () => {
  it('treats local and E.164 forms as the same number', () => {
    assert.equal(indianPhonesEqual('9049163636', '+919049163636'), true);
    assert.equal(indianPhonesEqual('919049163636', '9049163636'), true);
  });

  it('returns false for different numbers', () => {
    assert.equal(indianPhonesEqual('9049163636', '9876543210'), false);
  });
});

describe('indianLocalFromE164', () => {
  it('extracts 10 digits from stored +91 number', () => {
    assert.equal(indianLocalFromE164('+919876543210'), '9876543210');
  });

  it('returns null for invalid input', () => {
    assert.equal(indianLocalFromE164('+14155552671'), null);
  });
});

describe('formatIndianPhoneDisplay', () => {
  it('formats stored E.164 for display', () => {
    assert.equal(formatIndianPhoneDisplay('+919876543210'), '+91 98765 43210');
  });
});
