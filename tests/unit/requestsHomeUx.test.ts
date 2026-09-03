import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestTypeLabel } from '../../src/lib/residents/requestCenter';

const requestsHome = readFileSync(
  join(process.cwd(), 'src/components/customer/account/resident/requests/RequestsHome.tsx'),
  'utf8',
);
const roomChangeFlow = readFileSync(
  join(process.cwd(), 'src/components/customer/account/resident/requests/RoomChangeFlow.tsx'),
  'utf8',
);
const tokens = readFileSync(join(process.cwd(), 'src/lib/design-system/tokens.ts'), 'utf8');

test('requests page initially offers only Move Out and Change Bed', () => {
  assert.match(requestsHome, /title="Move out"/);
  assert.match(requestsHome, /title="Change bed"/);
  assert.match(requestsHome, /Continue to Move Out/);
  assert.match(requestsHome, /Continue to Change Bed/);
  assert.doesNotMatch(requestsHome, /Other requests/);
  assert.doesNotMatch(requestsHome, /title: 'Maintenance'/);
  assert.doesNotMatch(requestsHome, />Maintenance</);
  assert.doesNotMatch(requestsHome, />Complaint</);
  assert.doesNotMatch(requestsHome, />Support</);
  assert.doesNotMatch(requestsHome, /RequestsMakeFlow/);
});

test('requests page does not auto-open move-out or change-bed forms', () => {
  assert.match(requestsHome, /useState<SectionId \| null>\(null\)/);
  assert.match(requestsHome, /void props\.startMake/);
  assert.match(requestsHome, /void props\.initialCategory/);
  assert.doesNotMatch(requestsHome, /useEffect/);
  assert.match(requestsHome, /moveOutStage === 'form' \? \(/);
  assert.match(requestsHome, /changeBedStage === 'form' \? \(/);
});

test('accordion uses real buttons and exclusive open state', () => {
  assert.match(requestsHome, /aria-expanded=\{open\}/);
  assert.match(requestsHome, /type="button"/);
  assert.match(requestsHome, /setOpenSection\(id\)/);
  assert.match(requestsHome, /setChangeBedStage\('closed'\)/);
  assert.match(requestsHome, /setMoveOutStage\('closed'\)/);
  assert.match(requestsHome, /w-full/);
  assert.doesNotMatch(requestsHome, /overflow-x-scroll/);
});

test('active request status is compact and not an auto-open form', () => {
  assert.match(requestsHome, /Move-out request/);
  assert.match(requestsHome, /Change bed/);
  assert.match(requestsHome, /View details/);
  assert.match(requestsHome, /setMoveOutStage\('form'\)/);
});

test('existing engines remain wired after Continue', () => {
  assert.match(requestsHome, /<VacatingHome/);
  assert.match(requestsHome, /<RoomChangeFlow/);
  assert.match(roomChangeFlow, /submitRoomChangeAction/);
  assert.doesNotMatch(roomChangeFlow, /Confirm & pay/);
  assert.match(roomChangeFlow, /setStep\('done'\)/);
  assert.doesNotMatch(roomChangeFlow, /setStep\('payment'\)/);
  assert.match(roomChangeFlow, /Payment does not authorize the transfer/);
  assert.match(roomChangeFlow, /Confirm Change Bed/);
});

test('resident-facing room change copy is Change Bed', () => {
  assert.equal(requestTypeLabel('room_change'), 'Change Bed');
  assert.match(roomChangeFlow, /Change Bed confirmed/);
  assert.doesNotMatch(roomChangeFlow, />Room change</);
});

test('requests cards use Awesome PG resident theme tokens', () => {
  assert.match(requestsHome, /tier="resident"/);
  assert.match(requestsHome, /primaryBtn/);
  assert.match(requestsHome, /text-apg-orange/);
  assert.match(tokens, /export const primaryBtn/);
});
