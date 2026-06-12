import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isRemoteKycUrl,
  resolveKycStorageBackend,
} from '../../src/lib/kyc/storage';
import { KycStorageError, kycCustomerErrorMessage } from '../../src/lib/kyc/errors';

test('resolveKycStorageBackend prefers filesystem when KYC_STORAGE=filesystem', () => {
  const prev = process.env.KYC_STORAGE;
  const prevVercel = process.env.VERCEL;
  process.env.KYC_STORAGE = 'filesystem';
  delete process.env.VERCEL;
  try {
    assert.equal(resolveKycStorageBackend(), 'filesystem');
  } finally {
    if (prev === undefined) delete process.env.KYC_STORAGE;
    else process.env.KYC_STORAGE = prev;
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
  }
});

test('resolveKycStorageBackend throws on Vercel without Cloudinary', () => {
  const prevStorage = process.env.KYC_STORAGE;
  const prevVercel = process.env.VERCEL;
  const prevCloud = process.env.CLOUDINARY_CLOUD_NAME;
  process.env.VERCEL = '1';
  delete process.env.KYC_STORAGE;
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
  try {
    assert.throws(() => resolveKycStorageBackend(), KycStorageError);
  } finally {
    if (prevStorage === undefined) delete process.env.KYC_STORAGE;
    else process.env.KYC_STORAGE = prevStorage;
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    if (prevCloud === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
    else process.env.CLOUDINARY_CLOUD_NAME = prevCloud;
  }
});

test('isRemoteKycUrl detects HTTPS Cloudinary URLs', () => {
  assert.equal(
    isRemoteKycUrl('https://res.cloudinary.com/demo/image/upload/v1/aadhaar_front.jpg'),
    true,
  );
  assert.equal(isRemoteKycUrl('customer/sub/aadhaar_front.jpg'), false);
});

test('kycCustomerErrorMessage hides SQL errors', () => {
  const msg = kycCustomerErrorMessage(
    new Error('insert into kyc_submission_files (submission_id, kind, mime, content)'),
  );
  assert.match(msg, /KYC upload failed/);
  assert.doesNotMatch(msg, /insert into/i);
});

test('kycCustomerErrorMessage preserves validation copy', () => {
  assert.match(
    kycCustomerErrorMessage(new Error('Aadhaar front: Image is too blurry.')),
    /Aadhaar front/,
  );
});
