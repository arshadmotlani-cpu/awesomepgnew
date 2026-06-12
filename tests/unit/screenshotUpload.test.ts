import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPaymentScreenshotUploadAvailable } from '../../src/lib/payments/screenshotUpload';

test('payment screenshot upload is available in local dev without Blob', () => {
  const prevVercel = process.env.VERCEL;
  const prevBlob = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.VERCEL;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  try {
    assert.equal(isPaymentScreenshotUploadAvailable(), true);
  } finally {
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    if (prevBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevBlob;
  }
});

test('payment screenshot upload is blocked on Vercel without Blob', () => {
  const prevVercel = process.env.VERCEL;
  const prevBlob = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.VERCEL = '1';
  delete process.env.BLOB_READ_WRITE_TOKEN;
  try {
    assert.equal(isPaymentScreenshotUploadAvailable(), false);
  } finally {
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    if (prevBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevBlob;
  }
});
