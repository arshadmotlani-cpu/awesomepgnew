import assert from 'node:assert/strict';
import test from 'node:test';

test('loadRoomBrainSnapshot exports stable api version', async () => {
  const { loadRoomBrainSnapshot } = await import('../../src/roomOs/api/v1/loadRoomBrainSnapshot');
  assert.equal(typeof loadRoomBrainSnapshot, 'function');
});

test('room brain snapshot type includes collection and health fields', async () => {
  const mod = await import('../../src/roomOs/api/v1/loadRoomBrainSnapshot');
  const sample = {
    apiVersion: 'room-brain/v1' as const,
    roomId: 'r1',
    billingMonth: '2026-08-01',
    asOf: new Date().toISOString(),
    occupancy: { bedCount: 0, occupiedBedCount: 0, residents: [] },
    shared: null,
    electricitySettlement: null,
    collection: {
      totalRequiredPaise: 0,
      totalReceivedPaise: 0,
      totalOutstandingPaise: 0,
      settlementPercent: 100,
      outstandingPercent: 0,
    },
    depositRecovery: { totalRefundablePaise: 0, totalHeldPaise: 0 },
    exitMode: { residentsInExitMode: 0, bookingIds: [] },
    meterStatus: 'missing',
    billingStatus: 'awaiting_meter',
    healthStatus: 'healthy' as const,
  };
  assert.equal(sample.apiVersion, 'room-brain/v1');
  assert.ok('settlementPercent' in sample.collection);
  assert.ok(mod.loadRoomBrainSnapshot);
});
