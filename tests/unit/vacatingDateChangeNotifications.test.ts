import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildApprovalDeepLink, finalizeApprovalNotificationDeepLink } from '@/src/lib/approvals/approvalDeepLinks';

test('vacating_date_change action_item sync is registered in syncActionItems', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/actionItems.ts'), 'utf8');
  assert.match(src, /syncVacatingDateChangeRequests/);
  assert.match(src, /type: 'vacating_date_change'/);
  assert.match(src, /vacating_date_change:\$\{row\.requestId\}/);
});

test('enum migration adds vacating_date_change action item type', () => {
  const migration = readFileSync(
    join(process.cwd(), 'src/db/migrations/0146_action_item_vacating_date_change.sql'),
    'utf8',
  );
  assert.match(migration, /vacating_date_change/);
  const enums = readFileSync(join(process.cwd(), 'src/db/schema/enums.ts'), 'utf8');
  assert.match(enums, /'vacating_date_change'/);
});

test('approval deep links route date changes to Operations focus URL', () => {
  const meta = {
    dateChangeRequestId: 'req-99',
    bookingId: 'bk-1',
    vacatingRequestId: 'vr-1',
  };
  const href = buildApprovalDeepLink('vacating_date_change', meta, null);
  assert.match(href, /filter=vacating_requests/);
  assert.match(href, /date_change%3Areq-99|date_change:req-99/);

  const notifHref = finalizeApprovalNotificationDeepLink('vacating_date_change', href, meta);
  assert.equal(notifHref, href);
});

test('admin notifications label and module map include vacating_date_change', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/adminNotifications.ts'), 'utf8');
  assert.match(src, /vacating_date_change: 'Move-out Date Change'/);
  assert.match(src, /case 'vacating_date_change'/);
});

test('notification engine maps vacating_date_change inbox label', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/notificationEngine.ts'), 'utf8');
  assert.match(src, /vacating_date_change: 'Move-out Date Change'/);
});

test('vacating date change submit schedules admin notification sync', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/vacatingDateChange.ts'), 'utf8');
  assert.match(src, /scheduleAdminNotificationSync/);
  const cancelIdx = src.indexOf('cancelVacatingDateChangeRequest');
  assert.ok(cancelIdx >= 0);
  const cancelBody = src.slice(cancelIdx, cancelIdx + 2500);
  assert.match(cancelBody, /scheduleAdminNotificationSync/);
});

test('push service worker opens deep_link from payload', () => {
  const sw = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');
  assert.match(sw, /data\.deepLink/);
  assert.match(sw, /notificationclick/);
});
