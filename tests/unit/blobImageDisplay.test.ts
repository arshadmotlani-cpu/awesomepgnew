import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  privateBlobRequiresProxy,
  resolveBlobImageDisplaySrc,
  resolveBlobLinkHref,
} from '../../src/lib/storage/blobImageDisplay';

const PRIVATE =
  'https://abc.private.blob.vercel-storage.com/payments/proofs/test.jpg';

describe('blobImageDisplay', () => {
  it('requires proxy for private blob URLs', () => {
    assert.equal(privateBlobRequiresProxy(PRIVATE), true);
    assert.equal(resolveBlobImageDisplaySrc(PRIVATE), null);
    assert.equal(resolveBlobImageDisplaySrc(PRIVATE, '/api/admin/proof/1'), '/api/admin/proof/1');
  });

  it('allows data URLs without proxy', () => {
    const data = 'data:image/jpeg;base64,abc';
    assert.equal(resolveBlobImageDisplaySrc(data), data);
    assert.equal(privateBlobRequiresProxy(data), false);
  });

  it('allows public https URLs when no proxy', () => {
    assert.equal(
      resolveBlobImageDisplaySrc('https://cdn.example.com/qr.png'),
      'https://cdn.example.com/qr.png',
    );
  });

  it('prefers proxy for public URLs when provided', () => {
    assert.equal(
      resolveBlobLinkHref('https://cdn.example.com/qr.png', '/api/view/1'),
      '/api/view/1',
    );
  });
});
