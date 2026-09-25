import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

const residentPortalTabData = readFileSync(
  join(process.cwd(), 'src/services/residentPortalTabData.ts'),
  'utf8',
);
const requestDetail = readFileSync(
  join(process.cwd(), 'src/components/customer/account/resident/requests/RequestDetailView.tsx'),
  'utf8',
);
const lifecycle = readFileSync(
  join(process.cwd(), 'src/services/roomTransferLifecycle.ts'),
  'utf8',
);

test('requests tab loads open room change rows for resident', () => {
  assert.match(residentPortalTabData, /listOpenRoomChangeRequestsForCustomer/);
  assert.match(residentPortalTabData, /type: 'room_change'/);
});

test('resident can cancel open room change from request detail', () => {
  assert.match(requestDetail, /cancelRoomChangeAction/);
  assert.match(requestDetail, /Cancel bed transfer request/);
});

test('cancelRoomChangeRequest allows open workflow states', () => {
  const start = lifecycle.indexOf('export async function cancelRoomChangeRequest');
  const end = lifecycle.indexOf('export async function revertScheduledTransfersOnVacatingCancel');
  const body = lifecycle.slice(start, end);
  assert.match(body, /OPEN_ROOM_CHANGE_WORKFLOW\.includes/);
});
