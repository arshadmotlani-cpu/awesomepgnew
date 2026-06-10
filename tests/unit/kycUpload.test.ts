import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  KYC_MAX_UPLOAD_BYTES,
  KYC_TARGET_BYTES,
  KYC_FILE_TOO_LARGE_MESSAGE,
  validateKycUploadSize,
  kycUploadKindForField,
} from '../../src/lib/kyc/uploadLimits';

describe('validateKycUploadSize', () => {
  it('accepts files up to 10 MB', () => {
    assert.equal(validateKycUploadSize(KYC_MAX_UPLOAD_BYTES), null);
    assert.equal(validateKycUploadSize(5 * 1024 * 1024), null);
  });

  it('rejects empty files', () => {
    assert.equal(validateKycUploadSize(0), 'Choose an image to upload.');
  });

  it('rejects files over 10 MB with friendly copy', () => {
    assert.equal(
      validateKycUploadSize(KYC_MAX_UPLOAD_BYTES + 1),
      KYC_FILE_TOO_LARGE_MESSAGE,
    );
  });
});

describe('kycUploadKindForField', () => {
  it('maps selfie separately from aadhaar fields', () => {
    assert.equal(kycUploadKindForField('selfie'), 'selfie');
    assert.equal(kycUploadKindForField('aadhaarFront'), 'aadhaar');
    assert.equal(kycUploadKindForField('aadhaarBack'), 'aadhaar');
  });
});

describe('KYC compression targets', () => {
  it('targets under 3 MB for Server Action payloads', () => {
    assert.ok(KYC_TARGET_BYTES <= 3 * 1024 * 1024);
  });
});
