import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isKycUploadAvailable,
  isRemoteKycUrl,
  resolveKycStorageBackend,
} from '../../src/lib/kyc/storage';
import {
  KycStorageError,
  KYC_STORAGE_UNAVAILABLE_MESSAGE,
  kycCustomerErrorMessage,
} from '../../src/lib/kyc/errors';

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

test('isKycUploadAvailable is false on Vercel without Blob private token', () => {
  const prevStorage = process.env.KYC_STORAGE;
  const prevVercel = process.env.VERCEL;
  const prevBlob = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.VERCEL = '1';
  delete process.env.KYC_STORAGE;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  try {
    assert.equal(isKycUploadAvailable(), false);
    assert.throws(() => resolveKycStorageBackend(), KycStorageError);
  } finally {
    if (prevStorage === undefined) delete process.env.KYC_STORAGE;
    else process.env.KYC_STORAGE = prevStorage;
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    if (prevBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevBlob;
  }
});

test('resolveKycStorageBackend throws on Vercel without Blob private token', () => {
  const prevStorage = process.env.KYC_STORAGE;
  const prevVercel = process.env.VERCEL;
  const prevBlob = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.VERCEL = '1';
  delete process.env.KYC_STORAGE;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  try {
    assert.throws(() => resolveKycStorageBackend(), KycStorageError);
  } finally {
    if (prevStorage === undefined) delete process.env.KYC_STORAGE;
    else process.env.KYC_STORAGE = prevStorage;
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    if (prevBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevBlob;
  }
});

test('resolveKycStorageBackend uses blob when BLOB_READ_WRITE_TOKEN is set', () => {
  const prevStorage = process.env.KYC_STORAGE;
  const prevBlob = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.KYC_STORAGE;
  process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
  try {
    assert.equal(resolveKycStorageBackend(), 'blob');
  } finally {
    if (prevStorage === undefined) delete process.env.KYC_STORAGE;
    else process.env.KYC_STORAGE = prevStorage;
    if (prevBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevBlob;
  }
});

test('isRemoteKycUrl detects HTTPS legacy URLs', () => {
  assert.equal(
    isRemoteKycUrl('https://res.cloudinary.com/demo/image/upload/v1/aadhaar_front.jpg'),
    true,
  );
  assert.equal(isRemoteKycUrl('customer/sub/aadhaar_front.jpg'), false);
});

test('kycCustomerErrorMessage maps NOT_CONFIGURED to user-friendly copy', () => {
  const msg = kycCustomerErrorMessage(
    new KycStorageError('NOT_CONFIGURED', 'KYC storage is not configured for production'),
  );
  assert.equal(msg, KYC_STORAGE_UNAVAILABLE_MESSAGE);
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
