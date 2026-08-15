import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { stayRangeExclusiveEnd } from '@/src/lib/vacating/vacatingBedSemantics';

const vacatingDateChangeSource = readFileSync(
  join(process.cwd(), 'src/services/vacatingDateChange.ts'),
  'utf8',
);

test('applyApprovedVacatingDateChange uses half-open stay_range end (final stay + 1 day)', () => {
  assert.match(vacatingDateChangeSource, /stayRangeExclusiveEnd\(newDate\)/);
});

test('admin change panel is wired to financial workspace and vacating row actions', () => {
  const workspace = readFileSync(
    join(process.cwd(), 'src/components/admin/bookings/BookingFinancialWorkspace.tsx'),
    'utf8',
  );
  const rowActions = readFileSync(
    join(process.cwd(), 'src/components/admin/vacating/VacatingRowActions.tsx'),
    'utf8',
  );
  assert.match(workspace, /AdminChangeVacatingDatePanel/);
  assert.match(rowActions, /Change vacating date/);
  assert.match(rowActions, /AdminChangeVacatingDatePanel/);
});

test('resident portal tab data exposes vacating date change eligibility', () => {
  const profileData = readFileSync(
    join(process.cwd(), 'src/services/residentPortalTabData.ts'),
    'utf8',
  );
  const requestsHome = readFileSync(
    join(process.cwd(), 'src/components/customer/account/resident/requests/RequestsHome.tsx'),
    'utf8',
  );
  const profileOverview = readFileSync(
    join(process.cwd(), 'src/components/customer/account/resident/ProfileOverviewPanel.tsx'),
    'utf8',
  );
  assert.match(profileData, /canRequestVacatingDateChange/);
  assert.match(requestsHome, /id="resident-move-out"/);
  assert.match(requestsHome, /ResidentCancelMoveOutCard|VacatingHome/);
  assert.doesNotMatch(profileOverview, /ResidentHomeMoveOutStatus/);
  assert.doesNotMatch(profileOverview, /Change final stay date/);
});

test('stayRangeExclusiveEnd aligns bed release with vacating semantics', () => {
  assert.equal(stayRangeExclusiveEnd('2026-08-20'), '2026-08-21');
});
