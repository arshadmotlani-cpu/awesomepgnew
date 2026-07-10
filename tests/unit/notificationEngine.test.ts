import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('notification engine exposes mark read helpers', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/notificationEngine.ts'), 'utf8');
  assert.match(src, /markUserNotificationRead/);
  assert.match(src, /markUserNotificationsRead/);
  assert.match(src, /countUnreadForUser/);
});

test('admin notification drawer marks visible items read', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/components/admin/AdminNotificationCenter.tsx'),
    'utf8',
  );
  assert.match(src, /markAllVisible/);
  assert.match(src, /setUnreadCount\(0\)/);
});
