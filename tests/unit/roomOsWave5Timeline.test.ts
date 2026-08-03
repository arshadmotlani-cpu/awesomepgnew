/**
 * Room OS Wave 5 — Timeline Layer B unit tests.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ROOM_OS_EVENT_TYPES } from '@/src/roomOs/events/catalog';
import { formatTimelineEntry } from '@/src/roomOs/timeline/formatEntry';
import { dedupeTimelineEntries } from '@/src/roomOs/timeline/aggregateTimeline';

describe('Room OS Wave 5 — Timeline', () => {
  test('formatTimelineEntry covers all catalog event types', () => {
    for (const eventType of ROOM_OS_EVENT_TYPES) {
      const entry = formatTimelineEntry({
        id: 'row-1',
        eventId: 'evt-1',
        streamType: 'property',
        streamId: '00000000-0000-4000-8000-000000000001',
        eventType,
        occurredAt: new Date('2026-08-01T10:00:00.000Z'),
        rulesEffectivePackId: 'rules-db-v1:pg:digest',
        payload: { billingMonth: '2026-08-01', pgId: '00000000-0000-4000-8000-000000000001' },
        sourceRef: 'test',
      });
      assert.ok(entry.title.length > 0);
      assert.ok(entry.summary.length > 0);
      assert.equal(entry.eventType, eventType);
      assert.equal(entry.payloadDigest.length, 16);
    }
  });

  test('property_index.rebuild_requested formatter includes billing month', () => {
    const entry = formatTimelineEntry({
      id: 'row-2',
      eventId: 'evt-2',
      streamType: 'property',
      streamId: '00000000-0000-4000-8000-000000000002',
      eventType: 'property_index.rebuild_requested',
      occurredAt: new Date('2026-08-01T11:00:00.000Z'),
      rulesEffectivePackId: 'rules-db-v1:pg:digest',
      payload: { billingMonth: '2026-08-01', pgId: '00000000-0000-4000-8000-000000000002' },
      sourceRef: 'writer',
    });
    assert.match(entry.summary, /2026-08-01/);
    assert.equal(entry.title, 'Property index rebuild requested');
  });

  test('dedupeTimelineEntries keeps first occurrence by eventId', () => {
    const entries = dedupeTimelineEntries([
      {
        id: 'a',
        eventId: 'evt-dup',
        streamType: 'property',
        streamId: 'pg-1',
        occurredAt: '2026-08-01T12:00:00.000Z',
        eventType: 'work_queue.rebuilt',
        title: 'First',
        summary: 'First summary',
        rulesEffectivePackId: 'pack',
        payloadDigest: 'abc',
        sourceRef: 'test',
      },
      {
        id: 'b',
        eventId: 'evt-dup',
        streamType: 'property',
        streamId: 'pg-1',
        occurredAt: '2026-08-01T11:00:00.000Z',
        eventType: 'work_queue.rebuilt',
        title: 'Second',
        summary: 'Second summary',
        rulesEffectivePackId: 'pack',
        payloadDigest: 'abc',
        sourceRef: 'test',
      },
    ]);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.title, 'First');
  });
});
