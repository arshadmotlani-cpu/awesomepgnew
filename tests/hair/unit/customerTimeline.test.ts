import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterUnifiedTimeline,
  sortUnifiedTimeline,
  type UnifiedTimelineEvent,
} from '../../../src/hair/domain/customerTimeline/types.ts';

function event(
  partial: Partial<UnifiedTimelineEvent> & Pick<UnifiedTimelineEvent, 'id' | 'occurredAt' | 'category' | 'title'>,
): UnifiedTimelineEvent {
  return {
    body: null,
    metadata: null,
    ...partial,
  };
}

test('sortUnifiedTimeline orders newest first, then by id', () => {
  const older = event({
    id: 'a',
    occurredAt: new Date('2026-01-01T10:00:00Z'),
    category: 'visit',
    title: 'Older visit',
  });
  const newer = event({
    id: 'b',
    occurredAt: new Date('2026-01-02T10:00:00Z'),
    category: 'bill',
    title: 'Newer bill',
  });
  const sameTimeA = event({
    id: 'c',
    occurredAt: new Date('2026-01-02T10:00:00Z'),
    category: 'payment',
    title: 'Same time A',
  });
  const sameTimeB = event({
    id: 'd',
    occurredAt: new Date('2026-01-02T10:00:00Z'),
    category: 'payment',
    title: 'Same time B',
  });

  const sorted = sortUnifiedTimeline([older, newer, sameTimeB, sameTimeA]);
  assert.equal(sorted[0]?.id, 'b');
  assert.equal(sorted[1]?.id, 'c');
  assert.equal(sorted[2]?.id, 'd');
  assert.equal(sorted[3]?.id, 'a');
});

test('filterUnifiedTimeline returns all events for all filter', () => {
  const events = [
    event({
      id: '1',
      occurredAt: new Date(),
      category: 'visit',
      title: 'Visit',
    }),
    event({
      id: '2',
      occurredAt: new Date(),
      category: 'bill',
      title: 'Bill',
    }),
  ];
  assert.equal(filterUnifiedTimeline(events, 'all').length, 2);
});

test('filterUnifiedTimeline filters by category mapping', () => {
  const events = [
    event({
      id: '1',
      occurredAt: new Date(),
      category: 'visit',
      title: 'Visit',
    }),
    event({
      id: '2',
      occurredAt: new Date(),
      category: 'bill',
      title: 'Bill',
    }),
    event({
      id: '3',
      occurredAt: new Date(),
      category: 'payment',
      title: 'Payment',
    }),
    event({
      id: '4',
      occurredAt: new Date(),
      category: 'wallet',
      title: 'Wallet top-up',
    }),
    event({
      id: '5',
      occurredAt: new Date(),
      category: 'loyalty',
      title: 'Membership sold',
    }),
    event({
      id: '6',
      occurredAt: new Date(),
      category: 'note',
      title: 'Note',
    }),
  ];

  assert.deepEqual(
    filterUnifiedTimeline(events, 'visits').map((e) => e.id),
    ['1'],
  );
  assert.deepEqual(
    filterUnifiedTimeline(events, 'bills').map((e) => e.id),
    ['2'],
  );
  assert.deepEqual(
    filterUnifiedTimeline(events, 'payments').map((e) => e.id),
    ['3'],
  );
  assert.deepEqual(
    filterUnifiedTimeline(events, 'wallet').map((e) => e.id),
    ['4'],
  );
  assert.deepEqual(
    filterUnifiedTimeline(events, 'loyalty').map((e) => e.id),
    ['5'],
  );
});
