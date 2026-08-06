import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedVendorAttachmentMime } from '@/src/hair/lib/vendorAttachmentUpload';

test('vendor attachment MIME validation allows PDF and images only', () => {
  assert.equal(isAllowedVendorAttachmentMime('application/pdf'), true);
  assert.equal(isAllowedVendorAttachmentMime('image/jpeg'), true);
  assert.equal(isAllowedVendorAttachmentMime('image/png'), true);
  assert.equal(isAllowedVendorAttachmentMime('text/plain'), false);
  assert.equal(isAllowedVendorAttachmentMime('application/zip'), false);
});
