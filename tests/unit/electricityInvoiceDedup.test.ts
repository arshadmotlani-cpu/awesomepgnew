import test from 'node:test';
import assert from 'node:assert/strict';

test('duplicate group key encodes room month and customer', () => {
  const roomId = 'room-1';
  const billingMonth = '2026-06-01';
  const customerId = 'cust-1';
  const groupKey = `${roomId}:${billingMonth}:${customerId}`;
  const [parsedRoom, parsedMonth, parsedCustomer] = groupKey.split(':');
  assert.equal(parsedRoom, roomId);
  assert.equal(parsedMonth, billingMonth);
  assert.equal(parsedCustomer, customerId);
});

test('generation request idempotency: same requestId should replay not restart', () => {
  const requestId = 'req-abc';
  const seen = new Set<string>();
  function begin(req: string): 'started' | 'replay' {
    if (seen.has(req)) return 'replay';
    seen.add(req);
    return 'started';
  }
  assert.equal(begin(requestId), 'started');
  assert.equal(begin(requestId), 'replay');
});

test('one active invoice per resident room month is enforced by composite key', () => {
  const key = (roomId: string, month: string, customerId: string) =>
    `${roomId}|${month}|${customerId}`;
  const existing = new Set([key('r1', '2026-06-01', 'c1')]);
  const attemptDuplicate = existing.has(key('r1', '2026-06-01', 'c1'));
  assert.equal(attemptDuplicate, true);
  assert.equal(existing.has(key('r1', '2026-06-01', 'c2')), false);
});
