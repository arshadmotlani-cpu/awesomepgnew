/**
 * Scheduler high-contrast UI wiring — static source checks.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('StaffDaySchedulerGrid uses high-contrast scheduler classes', () => {
  const src = readFileSync(
    join(root, 'src/hair/components/appointments/StaffDaySchedulerGrid.tsx'),
    'utf8',
  );
  assert.match(src, /fyh-scheduler-time-label/);
  assert.match(src, /fyh-scheduler-staff-label/);
  assert.match(src, /fyh-scheduler-grid-slot/);
  assert.doesNotMatch(src, /border-\[color:var\(--fyh-border\)\]\//);
  assert.doesNotMatch(src, /text-white\/\d+/);
});

test('globals.css defines scheduler contrast tokens', () => {
  const css = readFileSync(join(root, 'src/hair/styles/globals.css'), 'utf8');
  assert.match(css, /\.fyh-scheduler-time-label/);
  assert.match(css, /color:\s*#ffffff/);
  assert.match(css, /--fyh-scheduler-grid-line/);
  assert.match(css, /--fyh-scheduler-border/);
});

test('AppointmentsCalendar view tabs use scheduler tab classes', () => {
  const src = readFileSync(
    join(root, 'src/hair/components/appointments/AppointmentsCalendar.tsx'),
    'utf8',
  );
  assert.match(src, /fyh-scheduler-tab-active/);
  assert.match(src, /fyh-scheduler-tab/);
  assert.doesNotMatch(src, /text-fyh-text-secondary hover:bg-white\/5/);
});
