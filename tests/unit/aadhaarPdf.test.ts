import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aadhaarPdfFilename } from '../../src/lib/kyc/aadhaarPdf';
import { kycHasAadhaarImages } from '../../src/lib/kyc/documentUrls';

describe('aadhaarPdfFilename', () => {
  it('slugifies resident names for download filenames', () => {
    assert.equal(aadhaarPdfFilename('Waqar Ahmad'), 'aadhaar-waqar-ahmad.pdf');
    assert.equal(aadhaarPdfFilename('  Rajesh Kumar! '), 'aadhaar-rajesh-kumar.pdf');
    assert.equal(aadhaarPdfFilename(''), 'aadhaar-resident.pdf');
  });
});

describe('kycHasAadhaarImages', () => {
  it('requires both front and back paths', () => {
    assert.equal(
      kycHasAadhaarImages({ aadhaarFrontPath: 'a.jpg', aadhaarBackPath: 'b.jpg' }),
      true,
    );
    assert.equal(kycHasAadhaarImages({ aadhaarFrontPath: 'a.jpg', aadhaarBackPath: '' }), false);
    assert.equal(kycHasAadhaarImages({ aadhaarFrontPath: null, aadhaarBackPath: 'b.jpg' }), false);
  });
});
