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

test('admin notification drawer loads unread inbox items', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/components/admin/AdminNotificationCenter.tsx'),
    'utf8',
  );
  assert.match(src, /\/api\/admin\/notifications\?state=unread/);
  assert.match(src, /appendNotifReadParam/);
});
