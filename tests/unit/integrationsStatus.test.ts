import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatStartupIntegrationReport,
  getIntegrationsHealthSummary,
} from '../../src/lib/integrations/status';
import { isKycUploadAvailable } from '../../src/lib/kyc/storage';

test('getIntegrationsHealthSummary reports payment proofs available in local dev', () => {
  const summary = getIntegrationsHealthSummary();
  assert.equal(summary.paymentProofUploads.available, true);
  assert.equal(summary.paymentProofUploads.status, 'ok');
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
    const summary = getIntegrationsHealthSummary();
    assert.equal(summary.kyc.uploadsAvailable, false);
    assert.equal(summary.blob.privateConfigured, false);
    assert.match(formatStartupIntegrationReport(summary), /Blob private configured = NO/);
    assert.match(formatStartupIntegrationReport(summary), /KYC uploads available = NO/);
  } finally {
    if (prevStorage === undefined) delete process.env.KYC_STORAGE;
    else process.env.KYC_STORAGE = prevStorage;
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    if (prevBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevBlob;
  }
});
