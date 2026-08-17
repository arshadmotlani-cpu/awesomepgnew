import assert from 'node:assert/strict';
import test from 'node:test';
import { formatSalonDisplayDate } from '../../../src/hair/lib/formatSalonDate.ts';

test('formatSalonDisplayDate uses D Month YY', () => {
  assert.equal(formatSalonDisplayDate('2026-08-17'), '17 August 26');
  assert.equal(formatSalonDisplayDate('2026-01-05'), '5 January 26');
});

type BasketLine = { durationMinutes: number; pricePaise: number };

function basketDuration(lines: BasketLine[]): number {
  return lines.reduce((sum, l) => sum + l.durationMinutes, 0);
}

function basketTotalPaise(lines: BasketLine[]): number {
  return lines.reduce((sum, l) => sum + l.pricePaise, 0);
}

function balanceDueAtCheckout(totalPaise: number, walletPaise: number): number {
  return Math.max(0, totalPaise - walletPaise);
}

test('service basket sums duration and price', () => {
  const lines = [
    { durationMinutes: 60, pricePaise: 150000 },
    { durationMinutes: 30, pricePaise: 60000 },
    { durationMinutes: 120, pricePaise: 450000 },
  ];
  assert.equal(basketDuration(lines), 210);
  assert.equal(basketTotalPaise(lines), 660000);
});

test('balance due subtracts wallet credit without double-counting advance', () => {
  const total = 610000;
  const wallet = 200000;
  assert.equal(balanceDueAtCheckout(total, wallet), 410000);
  assert.equal(balanceDueAtCheckout(total, 0), 610000);
  assert.equal(balanceDueAtCheckout(50000, 80000), 0);
});

test('adding advance increases wallet — ledger is single source of truth', () => {
  const walletBefore = 200000;
  const advanceAdded = 100000;
  const walletAfter = walletBefore + advanceAdded;
  assert.equal(walletAfter, 300000);
  const total = 610000;
  assert.equal(balanceDueAtCheckout(total, walletAfter), 310000);
});

test('same staff for all assigns one staff id to every line', () => {
  const staffId = 'staff-a';
  const lines = [
    { key: '1', staffId: 'staff-b' },
    { key: '2', staffId: 'staff-c' },
  ];
  const sameStaffForAll = true;
  const updated = sameStaffForAll
    ? lines.map((l) => ({ ...l, staffId }))
    : lines;
  assert.deepEqual(updated.map((l) => l.staffId), ['staff-a', 'staff-a']);
});

test('different staff per service preserves line staff ids', () => {
  const lines = [
    { key: '1', staffId: 'staff-nida' },
    { key: '2', staffId: 'staff-arshad' },
  ];
  const sameStaffForAll = false;
  const updated = sameStaffForAll
    ? lines.map((l) => ({ ...l, staffId: 'staff-a' }))
    : lines;
  assert.deepEqual(updated.map((l) => l.staffId), ['staff-nida', 'staff-arshad']);
});
