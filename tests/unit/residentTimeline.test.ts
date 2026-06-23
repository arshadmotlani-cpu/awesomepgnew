import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  buildResidentTimeline,
  deriveTimelineSummary,
  parseRoomBedQuery,
  resolveResidentTimelineMatches,
} from '../../src/services/residentTimeline';
import type {
  ResidentTimelineEvent,
  ResidentTimelineSubject,
} from '../../src/lib/admin/residentTimelineTypes';

const baseSubject: ResidentTimelineSubject = {
  customerId: 'cust-1',
  customerName: 'Test Resident',
  phone: '+919999999999',
  email: 'test@example.com',
  bookingId: 'bk-1',
  bookingCode: 'APG-2026-0001',
  bookingStatus: 'confirmed',
  pgName: 'Demo PG',
  roomNumber: '204',
  bedCode: 'B2',
};

function event(partial: Partial<ResidentTimelineEvent> & Pick<ResidentTimelineEvent, 'sourceTable' | 'status' | 'kind'>): ResidentTimelineEvent {
  return {
    id: 'e1',
    label: 'test',
    recordId: 'rec-1',
    timestamp: new Date(),
    bookingId: 'bk-1',
    bookingCode: 'APG-2026-0001',
    detail: null,
    adminHref: null,
    sourceTable: partial.sourceTable,
    status: partial.status,
    kind: partial.kind,
    ...partial,
  };
}

test('deriveTimelineSummary flags pending vacating for admin approval', () => {
  const summary = deriveTimelineSummary(baseSubject, [
    event({ sourceTable: 'vacating_requests', status: 'pending', kind: 'submitted' }),
  ]);
  assert.match(summary.existsSummary, /move-out notice exists/i);
  assert.match(summary.nextAction, /admin.*vacating/i);
  assert.match(summary.blockedReason ?? '', /approve move-out/i);
});

test('deriveTimelineSummary flags orphan uploads', () => {
  const summary = deriveTimelineSummary(baseSubject, [
    event({
      sourceTable: 'resident_upload_events',
      status: 'uploaded',
      kind: 'uploaded_document',
      detail: 'Not visible to admin',
    }),
  ]);
  assert.match(summary.existsSummary, /upload exists/i);
  assert.match(summary.nextAction, /submit step/i);
});

test('deriveTimelineSummary flags pending_approval booking', () => {
  const summary = deriveTimelineSummary(
    { ...baseSubject, bookingStatus: 'pending_approval' },
    [],
  );
  assert.match(summary.nextAction, /Collections/i);
});

test('parseRoomBedQuery accepts room and bed formats', () => {
  assert.deepEqual(parseRoomBedQuery('204 B2'), { roomNumber: '204', bedCode: 'B2' });
  assert.deepEqual(parseRoomBedQuery('204-B2'), { roomNumber: '204', bedCode: 'B2' });
  assert.equal(parseRoomBedQuery('Atif'), null);
});
