import assert from 'node:assert/strict';
import test from 'node:test';
import { pickAuthoritativePrimaryStay } from '@/src/lib/occupancy/authoritativePrimaryStay';
import { canTransitionRoomChange } from '@/src/lib/roomTransfer/stateMachine';

test('CASE A — completed transfer current assignment is the new active stay, not the old UUID', () => {
  const chosen = pickAuthoritativePrimaryStay([
    {
      bedId: 'old-low-uuid',
      status: 'completed',
      inStayToday: false,
      upcomingMonthly: false,
      stayStart: '2026-01-01',
    },
    {
      bedId: 'new-high-uuid',
      status: 'active',
      inStayToday: true,
      upcomingMonthly: false,
      stayStart: '2026-09-03',
    },
  ]);
  assert.equal(chosen?.bedId, 'new-high-uuid');
});

test('CASE F — refresh keeps the active stay even when an older reservation sorts first by id', () => {
  const chosen = pickAuthoritativePrimaryStay([
    {
      bedId: 'aaa-old',
      status: 'completed',
      inStayToday: false,
      upcomingMonthly: false,
      stayStart: '2025-06-01',
    },
    {
      bedId: 'zzz-new',
      status: 'active',
      inStayToday: true,
      upcomingMonthly: false,
      stayStart: '2026-08-31',
    },
  ]);
  assert.equal(chosen?.bedId, 'zzz-new');
});

test('CASE J — in-flight hold is not current assignment', () => {
  const current = pickAuthoritativePrimaryStay([
    {
      bedId: 'current',
      status: 'active',
      inStayToday: true,
      upcomingMonthly: false,
      stayStart: '2026-01-01',
    },
  ]);
  assert.equal(current?.bedId, 'current');
});

test('occupy-today remains a two-step workflow PAYMENT_PENDING → READY_TO_TRANSFER → TRANSFERRING', () => {
  assert.equal(canTransitionRoomChange('PAYMENT_PENDING', 'TRANSFERRING'), false);
  assert.equal(canTransitionRoomChange('PAYMENT_PENDING', 'READY_TO_TRANSFER'), true);
  assert.equal(canTransitionRoomChange('READY_TO_TRANSFER', 'TRANSFERRING'), true);
});
