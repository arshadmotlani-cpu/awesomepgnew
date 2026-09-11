import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROOF_MAX_EDGE_PX,
  PROOF_MAX_UPLOAD_BYTES,
  PROOF_TARGET_BYTES,
  validateProofUploadFile,
  validateProofUploadSize,
} from '@/src/lib/payments/proofUploadLimits';

test('validateProofUploadSize rejects empty and oversized files', () => {
  assert.equal(validateProofUploadSize(0), 'Choose an image to upload.');
  assert.match(
    validateProofUploadSize(PROOF_MAX_UPLOAD_BYTES + 1) ?? '',
    /10 MB/,
  );
  assert.equal(validateProofUploadSize(1024), null);
});

test('validateProofUploadFile accepts images and rejects other types', () => {
  assert.equal(
    validateProofUploadFile({ type: 'image/jpeg', size: 1000, name: 'meter.jpg' } as File),
    null,
  );
  assert.equal(
    validateProofUploadFile({ type: 'application/pdf', size: 1000, name: 'doc.pdf' } as File),
    'Please choose a photo (JPEG, PNG, or similar).',
  );
  assert.equal(
    validateProofUploadFile({ type: '', size: 1000, name: 'photo.heic' } as File),
    null,
  );
});

test('proof compression targets align with server pipeline', () => {
  assert.equal(PROOF_MAX_EDGE_PX, 1200);
  assert.ok(PROOF_TARGET_BYTES <= 450_000);
});
