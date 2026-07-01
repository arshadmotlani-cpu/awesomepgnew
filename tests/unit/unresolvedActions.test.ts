import assert from 'node:assert/strict';
import test from 'node:test';
import { UNRESOLVED_ACTION_BADGE_BUCKET } from '@/src/services/unresolvedActions';
import { mapUnresolvedActionRow } from '@/src/lib/residents/residentUnresolvedActions';

test('every unresolved action type maps to a sidebar badge bucket', () => {
  const types = [
    'kyc_review',
    'payment_proof_review',
    'bed_assignment',
    'move_out_approval',
    'checkout_settlement',
    'deposit_refund_approval',
    'room_transfer_approval',
    'maintenance_approval',
  ] as const;

  for (const type of types) {
    assert.ok(UNRESOLVED_ACTION_BADGE_BUCKET[type], `missing bucket for ${type}`);
  }
});

test('mapUnresolvedActionRow preserves href and label', () => {
  const row = mapUnresolvedActionRow({
    id: 'a',
    actionType: 'kyc_review',
    entityType: 'kyc_submission',
    entityId: 'sub-1',
    residentId: 'cust-1',
    pgId: 'pg-1',
    status: 'OPEN',
    priority: 'high',
    sourceKey: 'unresolved:kyc:sub-1',
    href: '/admin/residents/kyc/sub-1',
    label: 'Review KYC',
    createdAt: new Date(),
    resolvedAt: null,
  });
  assert.equal(row.kind, 'kyc_review');
  assert.equal(row.href, '/admin/residents/kyc/sub-1');
  assert.equal(row.priority, 'high');
});
