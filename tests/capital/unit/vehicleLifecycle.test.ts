import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allowedTransitions,
  autoStatusOnActivity,
  canTransition,
  derivedBadges,
  lifecycleLabel,
  suggestTransitionOnActivity,
} from '../../../src/capital/lib/vehicleLifecycle';

describe('vehicleLifecycle (ADR-017)', () => {
  it('maps dealer-facing labels', () => {
    assert.equal(lifecycleLabel('purchased'), 'Just Purchased');
    assert.equal(lifecycleLabel('repairing'), 'Under Repair');
    assert.equal(lifecycleLabel('painting'), 'Under Repair (Painting)');
    assert.equal(lifecycleLabel('ready'), 'Ready For Sale');
    assert.equal(lifecycleLabel('listed'), 'Listed For Sale');
    assert.equal(lifecycleLabel('cancelled'), 'Archived');
  });

  it('allows expected manual transitions and blocks invalid jumps', () => {
    assert.deepEqual(allowedTransitions('purchased').sort(), [
      'cancelled',
      'painting',
      'ready',
      'repairing',
    ]);
    assert.equal(canTransition('purchased', 'ready'), true);
    assert.equal(canTransition('purchased', 'sold'), false);
    assert.equal(canTransition('ready', 'listed'), true);
    assert.equal(canTransition('listed', 'sold'), false); // sale workflow
    assert.equal(canTransition('sold', 'settled'), false); // settle workflow
    assert.equal(canTransition('settled', 'purchased'), false);
  });

  it('auto-sets repairing only from purchased or painting on repair_advance', () => {
    assert.equal(autoStatusOnActivity('purchased', 'repair_advance'), 'repairing');
    assert.equal(autoStatusOnActivity('painting', 'repair_advance'), 'repairing');
    assert.equal(autoStatusOnActivity('ready', 'repair_advance'), null);
    assert.equal(autoStatusOnActivity('listed', 'repair_advance'), null);
    assert.equal(autoStatusOnActivity('repairing', 'repair_advance'), null);
  });

  it('suggests ready after repair_settlement without auto-flipping', () => {
    assert.equal(suggestTransitionOnActivity('repairing', 'repair_settlement'), 'ready');
    assert.equal(suggestTransitionOnActivity('painting', 'repair_settlement'), 'ready');
    assert.equal(autoStatusOnActivity('repairing', 'repair_settlement'), null);
  });

  it('derives Purchase Pending from seller payment remaining only', () => {
    // No purchase price → no fabricated purchase badges
    assert.deepEqual(
      derivedBadges({
        status: 'purchased',
        purchasePricePaise: 0,
        milestonesPaidPaise: 50_000_00,
      }),
      [],
    );
    assert.deepEqual(
      derivedBadges({
        status: 'purchased',
        purchasePricePaise: 500_000_00,
        milestonesPaidPaise: 100_000_00,
      }),
      [{ id: 'purchase_pending', label: 'Purchase Pending' }],
    );
    // Seller paid in full → no Purchase Pending
    assert.deepEqual(
      derivedBadges({
        status: 'purchased',
        purchasePricePaise: 500_000_00,
        milestonesPaidPaise: 500_000_00,
      }),
      [],
    );
    assert.deepEqual(
      derivedBadges({
        status: 'repairing',
        purchasePricePaise: 500_000_00,
        milestonesPaidPaise: 0,
      }),
      [],
    );
  });
});
