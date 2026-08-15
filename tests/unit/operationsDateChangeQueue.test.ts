import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapVacatingDateChangeToOpsItem } from '@/src/lib/operations/operationsQueueVacating';
import {
  operationsFilterHref,
  vacatingDateChangeOperationsHref,
} from '@/src/lib/operations/operationsFilterLinks';
import type { PendingVacatingDateChangeOpsRow } from '@/src/services/vacatingDateChange';

function mockDateChangeRow(
  overrides: Partial<PendingVacatingDateChangeOpsRow> = {},
): PendingVacatingDateChangeOpsRow {
  return {
    requestId: 'req-1',
    vacatingRequestId: 'vr-1',
    bookingId: 'bk-1',
    customerId: 'cust-1',
    customerName: 'Bhuwan',
    customerPhone: '9999999999',
    bookingCode: 'APG-2026-0083',
    pgId: 'pg-1',
    pgName: 'Shantinagar',
    roomNumber: '201',
    bedCode: 'A',
    noticeGivenDate: '2026-07-23',
    currentVacatingDate: '2026-08-20',
    requestedVacatingDate: '2026-08-15',
    refundDeltaPaise: -5000,
    preview: {
      noticeCompliant: true,
      direction: 'earlier',
      unusedPrepaidRentPaise: 12000,
      additionalRentPaise: 0,
      currentEstimatedRefundPaise: 100000,
      requestedEstimatedRefundPaise: 105000,
    },
    ...overrides,
  } as PendingVacatingDateChangeOpsRow;
}

test('vacatingDateChangeOperationsHref targets Move-out tab with focus param', () => {
  const href = vacatingDateChangeOperationsHref('req-abc');
  assert.equal(
    href,
    operationsFilterHref('vacating_requests', 'date_change:req-abc'),
  );
  assert.match(href, /filter=vacating_requests/);
  assert.match(href, /focus=date_change%3Areq-abc/);
});

test('mapVacatingDateChangeToOpsItem uses stable id and vacating_requests queue', () => {
  const item = mapVacatingDateChangeToOpsItem(mockDateChangeRow());

  assert.equal(item.id, 'date_change:req-1');
  assert.equal(item.queue, 'vacating_requests');
  assert.equal(item.dateChangeRequestId, 'req-1');
  assert.equal(item.vacatingRequestId, 'vr-1');
  assert.equal(item.bookingCode, 'APG-2026-0083');
  assert.match(item.openHref, /date_change/);
  assert.match(item.reason, /Leaving date change/);
});

test('unified operations queue wires pending date changes', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/unifiedOperationsQueue.ts'),
    'utf8',
  );
  assert.match(src, /appendPendingVacatingDateChangeOpsItems/);
  assert.match(src, /listPendingVacatingDateChangesForOps/);
  assert.match(src, /mapVacatingDateChangeToOpsItem/);
});

test('operations page mounts attention board and activity feed', () => {
  const page = readFileSync(
    join(process.cwd(), 'app/(admin)/admin/operations/page.tsx'),
    'utf8',
  );
  assert.match(page, /OperationsAttentionBoard/);
  assert.match(page, /OperationsActivityFeed/);
  assert.match(page, /loadOperationsActivityFeed/);
  assert.match(page, /dateChangeBundle/);
});

test('move-out tab renders date change approval panels', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/components/admin/operations/OperationsMasterQueue.tsx'),
    'utf8',
  );
  assert.match(src, /OperationsVacatingDateChangePanels/);
  assert.match(src, /dateChangeBundle/);
});
