import assert from 'node:assert/strict';
import test from 'node:test';
import { hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';
import { resendInvitation, revokeInvitation } from '@/src/platform/services/admin';

const dbConfigured = hasPlatformDatabaseUrl();

test('revokeInvitation rejects missing invitation', { skip: !dbConfigured }, async () => {
  await assert.rejects(
    () => revokeInvitation('nonexistent-id', 'actor-id'),
    /Invitation not found/,
  );
});

test('resendInvitation rejects missing invitation', { skip: !dbConfigured }, async () => {
  await assert.rejects(
    () => resendInvitation('nonexistent-id', 'actor-id'),
    /Invitation not found/,
  );
});
