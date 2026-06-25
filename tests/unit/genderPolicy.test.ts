import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  genderPolicyMismatchMessage,
  residentGenderMatchesPgPolicy,
  validateResidentGenderForPgPolicy,
} from '../../src/lib/pg/genderPolicy';

describe('genderPolicy', () => {
  it('coed accepts all resident genders', () => {
    assert.equal(residentGenderMatchesPgPolicy('male', 'coed'), true);
    assert.equal(residentGenderMatchesPgPolicy('female', 'coed'), true);
    assert.equal(residentGenderMatchesPgPolicy('other', 'coed'), true);
  });

  it('male-only PG accepts male residents only', () => {
    assert.equal(residentGenderMatchesPgPolicy('male', 'male'), true);
    assert.equal(residentGenderMatchesPgPolicy('female', 'male'), false);
    assert.equal(residentGenderMatchesPgPolicy('other', 'male'), false);
  });

  it('female-only PG accepts female residents only', () => {
    assert.equal(residentGenderMatchesPgPolicy('female', 'female'), true);
    assert.equal(residentGenderMatchesPgPolicy('male', 'female'), false);
  });

  it('validateResidentGenderForPgPolicy returns structured error', () => {
    const result = validateResidentGenderForPgPolicy('female', 'male');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, genderPolicyMismatchMessage('male'));
    }
  });
});
