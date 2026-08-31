import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { persistEmployeeQrCodeUrl } from '@/src/workforce/lib/persistEmployeeQr';

describe('persistEmployeeQrCodeUrl', () => {
  test('returns null for empty input', async () => {
    assert.equal(await persistEmployeeQrCodeUrl(null), null);
    assert.equal(await persistEmployeeQrCodeUrl(''), null);
  });

  test('passes through existing http URLs', async () => {
    const url = 'https://example.blob.vercel-storage.com/qr.png';
    assert.equal(await persistEmployeeQrCodeUrl(url), url);
  });

  test('keeps small inline data URLs when blob storage is not configured', async () => {
    const prev = process.env.BLOB_PUBLIC_READ_WRITE_TOKEN;
    const prevPrivate = process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_PUBLIC_READ_WRITE_TOKEN;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    try {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
      assert.equal(await persistEmployeeQrCodeUrl(dataUrl), dataUrl);
    } finally {
      if (prev === undefined) delete process.env.BLOB_PUBLIC_READ_WRITE_TOKEN;
      else process.env.BLOB_PUBLIC_READ_WRITE_TOKEN = prev;
      if (prevPrivate === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
      else process.env.BLOB_READ_WRITE_TOKEN = prevPrivate;
    }
  });
});
