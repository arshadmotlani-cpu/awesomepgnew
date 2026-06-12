import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isBlobPrivateConfigured,
  isBlobPublicConfigured,
  isBlobUrl,
  isPrivateBlobUrl,
  roomImageBlobPath,
} from '../../src/lib/storage/blob';

test('isBlobPrivateConfigured reflects BLOB_READ_WRITE_TOKEN', () => {
  const prev = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  try {
    assert.equal(isBlobPrivateConfigured(), false);
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
    assert.equal(isBlobPrivateConfigured(), true);
  } finally {
    if (prev === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prev;
  }
});

test('isBlobPublicConfigured prefers BLOB_PUBLIC_READ_WRITE_TOKEN', () => {
  const prevPrivate = process.env.BLOB_READ_WRITE_TOKEN;
  const prevPublic = process.env.BLOB_PUBLIC_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_PUBLIC_READ_WRITE_TOKEN;
  try {
    assert.equal(isBlobPublicConfigured(), false);
    process.env.BLOB_PUBLIC_READ_WRITE_TOKEN = 'public-token';
    assert.equal(isBlobPublicConfigured(), true);
  } finally {
    if (prevPrivate === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevPrivate;
    if (prevPublic === undefined) delete process.env.BLOB_PUBLIC_READ_WRITE_TOKEN;
    else process.env.BLOB_PUBLIC_READ_WRITE_TOKEN = prevPublic;
  }
});

test('isBlobUrl detects Vercel Blob URLs', () => {
  assert.equal(
    isBlobUrl('https://abc.private.blob.vercel-storage.com/kyc/x/y.jpg'),
    true,
  );
  assert.equal(isBlobUrl('/local/path.jpg'), false);
});

test('isPrivateBlobUrl detects private store hostnames', () => {
  assert.equal(
    isPrivateBlobUrl('https://abc.private.blob.vercel-storage.com/payments/proof.jpg'),
    true,
  );
  assert.equal(
    isPrivateBlobUrl('https://abc.public.blob.vercel-storage.com/pg/image.jpg'),
    false,
  );
});

test('roomImageBlobPath builds future room image pathname', () => {
  assert.equal(roomImageBlobPath('room-1', 'photo.jpg'), 'rooms/room-1/photo.jpg');
});
