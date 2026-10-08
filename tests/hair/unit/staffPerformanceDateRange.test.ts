import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  parseStaffPerformanceSearchParams,
  shiftStaffPerformanceDayRange,
  staffPerformanceDefaultDayRange,
  staffPerformanceDayKeysToDateRange,
} from '../../../src/hair/lib/staffPerformancePeriod.ts';

const TZ = 'Asia/Kolkata';
const NOW = new Date('2026-10-08T10:30:00.000Z');

test('defaults to today → today in salon timezone', () => {
  const parsed = parseStaffPerformanceSearchParams({}, TZ, NOW);
  const expected = staffPerformanceDefaultDayRange(TZ, NOW);
  assert.equal(parsed.fromDayKey, expected.fromDayKey);
  assert.equal(parsed.toDayKey, expected.toDayKey);
  assert.equal(parsed.fromDayKey, parsed.toDayKey);
});

test('previous arrow shifts single day backward', () => {
  const shifted = shiftStaffPerformanceDayRange('2026-10-08', '2026-10-08', -1);
  assert.deepEqual(shifted, { fromDayKey: '2026-10-07', toDayKey: '2026-10-07' });
});

test('next arrow shifts single day forward', () => {
  const shifted = shiftStaffPerformanceDayRange('2026-10-08', '2026-10-08', 1);
  assert.deepEqual(shifted, { fromDayKey: '2026-10-09', toDayKey: '2026-10-09' });
});

test('multi-day range shifts backward by one day', () => {
  const shifted = shiftStaffPerformanceDayRange('2026-10-01', '2026-10-05', -1);
  assert.deepEqual(shifted, { fromDayKey: '2026-09-30', toDayKey: '2026-10-04' });
});

test('multi-day range shifts forward by one day', () => {
  const shifted = shiftStaffPerformanceDayRange('2026-10-01', '2026-10-05', 1);
  assert.deepEqual(shifted, { fromDayKey: '2026-10-02', toDayKey: '2026-10-06' });
});

test('from after to is normalized when parsing URL', () => {
  const parsed = parseStaffPerformanceSearchParams(
    { from: '2026-10-10', to: '2026-10-05' },
    TZ,
    NOW,
  );
  assert.equal(parsed.fromDayKey, '2026-10-05');
  assert.equal(parsed.toDayKey, '2026-10-10');
});

test('URL from/to loads correctly', () => {
  const parsed = parseStaffPerformanceSearchParams(
    { from: '2026-10-01', to: '2026-10-08' },
    TZ,
    NOW,
  );
  assert.equal(parsed.fromDayKey, '2026-10-01');
  assert.equal(parsed.toDayKey, '2026-10-08');
});

test('legacy period=quarter maps to day keys without crashing', () => {
  const parsed = parseStaffPerformanceSearchParams({ period: 'quarter' }, TZ, NOW);
  assert.ok(parsed.fromDayKey <= parsed.toDayKey);
  assert.match(parsed.fromDayKey, /^\d{4}-\d{2}-\d{2}$/);
});

test('legacy compare param is ignored', () => {
  const parsed = parseStaffPerformanceSearchParams(
    { compare: 'same_mtd_last_month', period: 'month' },
    TZ,
    NOW,
  );
  assert.ok(parsed.fromDayKey);
  assert.ok(parsed.toDayKey);
});

test('inclusive day range covers full salon days', () => {
  const range = staffPerformanceDayKeysToDateRange(TZ, '2026-10-08', '2026-10-08');
  assert.ok(range.to.getTime() > range.from.getTime());
  const spanMs = range.to.getTime() - range.from.getTime();
  assert.equal(spanMs, 24 * 60 * 60 * 1000);
});

test('staff performance filter bar uses from/to URL only', () => {
  const src = readFileSync(
    'src/hair/components/dashboard/staff-performance/StaffPerformanceFilterBar.tsx',
    'utf8',
  );
  assert.doesNotMatch(src, /label: 'Today'/);
  assert.doesNotMatch(src, /Previous period/);
  assert.doesNotMatch(src, /period:/);
  assert.match(src, /params\.delete\('period'\)/);
  assert.match(src, /shiftStaffPerformanceDayRange/);
});

test('export action names files with selected from/to range', () => {
  const action = readFileSync('src/hair/actions/staffPerformanceExport.ts', 'utf8');
  assert.match(action, /fromDayKey.*toDayKey/);
  assert.match(action, /fyh-staff-performance-\$\{parsed\.fromDayKey\}_to_\$\{parsed\.toDayKey\}/);
});
