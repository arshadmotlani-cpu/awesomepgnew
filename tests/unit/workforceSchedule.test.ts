import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  applyScheduleDayToTargets,
  applyWeekOffToExistingSchedule,
  normalizeScheduleDays,
  reconcileScheduleWithWeekOff,
  resolveAdjacentScheduleField,
  resolveVerticalScheduleField,
  syncScheduleWithWeekOff,
  validateScheduleDays,
} from '@/src/workforce/lib/scheduleEditor';
import { parseScheduleDaysFromForm } from '@/src/workforce/actions/parseHrForm';
import {
  defaultGrantsForAccessRole,
  hasWorkforcePermission,
  mapLegacyHairPermissions,
} from '@/src/workforce/permissions/presets';

describe('Workforce schedule editor helpers', () => {
  test('normalizeScheduleDays preserves saved off days and times', () => {
    const days = normalizeScheduleDays([
      { dayOfWeek: 0, startTime: '09:00', endTime: '18:00', isOff: false },
      { dayOfWeek: 1, startTime: '11:00', endTime: '20:00', isOff: false },
    ]);
    const sun = days.find((d) => d.dayOfWeek === 0);
    const mon = days.find((d) => d.dayOfWeek === 1);
    assert.equal(sun?.isOff, false);
    assert.equal(sun?.startTime, '09:00');
    assert.equal(mon?.endTime, '20:00');
  });

  test('validateScheduleDays rejects end before start on working days', () => {
    assert.throws(() =>
      validateScheduleDays([
        { dayOfWeek: 1, startTime: '18:00', endTime: '11:00', isOff: false },
      ]),
    );
  });

  test('validateScheduleDays allows off days without times', () => {
    assert.doesNotThrow(() =>
      validateScheduleDays([{ dayOfWeek: 0, startTime: '', endTime: '', isOff: true }]),
    );
  });

  test('keyboard field navigation order', () => {
    assert.deepEqual(resolveAdjacentScheduleField(1, 'start', 'next'), {
      dayOfWeek: 1,
      field: 'end',
    });
    assert.deepEqual(resolveAdjacentScheduleField(1, 'end', 'next'), {
      dayOfWeek: 2,
      field: 'start',
    });
    assert.deepEqual(resolveVerticalScheduleField(2, 'start', 'down'), {
      dayOfWeek: 3,
      field: 'start',
    });
  });

  test('syncScheduleWithWeekOff marks Monday off when selected in weekly off days', () => {
    const days = normalizeScheduleDays();
    const synced = syncScheduleWithWeekOff(days, [1]);
    const mon = synced.find((d) => d.dayOfWeek === 1);
    const tue = synced.find((d) => d.dayOfWeek === 2);
    assert.equal(mon?.isOff, true);
    assert.equal(mon?.startTime, '11:00');
    assert.equal(tue?.isOff, false);
  });

  test('syncScheduleWithWeekOff restores Monday working when unchecked', () => {
    const off = syncScheduleWithWeekOff(normalizeScheduleDays(), [1]);
    const restored = syncScheduleWithWeekOff(off, []);
    const mon = restored.find((d) => d.dayOfWeek === 1);
    assert.equal(mon?.isOff, false);
    assert.equal(mon?.startTime, '11:00');
    assert.equal(mon?.endTime, '20:00');
  });

  test('syncScheduleWithWeekOff applies to all weekdays generically', () => {
    for (let dow = 0; dow <= 6; dow += 1) {
      const synced = syncScheduleWithWeekOff(normalizeScheduleDays(), [dow]);
      assert.equal(synced.find((d) => d.dayOfWeek === dow)?.isOff, true);
    }
  });

  test('reconcileScheduleWithWeekOff makes weekly off authoritative on persist', () => {
    const days = reconcileScheduleWithWeekOff(
      [{ dayOfWeek: 1, startTime: '09:00', endTime: '18:00', isOff: false }],
      [1],
    );
    assert.equal(days.find((d) => d.dayOfWeek === 1)?.isOff, true);
  });

  test('unchecking weekly off restores a working day even if schedule isOff was stale', () => {
    const days = reconcileScheduleWithWeekOff(
      [{ dayOfWeek: 1, startTime: '09:00', endTime: '18:00', isOff: true }],
      [],
    );
    assert.equal(days.find((d) => d.dayOfWeek === 1)?.isOff, false);
  });

  test('multiple weekly offs and Sunday-only work', () => {
    const multi = reconcileScheduleWithWeekOff(normalizeScheduleDays(), [0, 1, 6]);
    assert.equal(multi.filter((d) => d.isOff).map((d) => d.dayOfWeek).join(','), '0,1,6');
    const sunday = reconcileScheduleWithWeekOff(normalizeScheduleDays(), [0]);
    assert.equal(sunday.find((d) => d.dayOfWeek === 0)?.isOff, true);
    assert.equal(sunday.filter((d) => d.dayOfWeek !== 0).every((d) => !d.isOff), true);
  });

  test('applyWeekOffToExistingSchedule preserves custom working times', () => {
    const existing = normalizeScheduleDays([
      { dayOfWeek: 1, startTime: '09:30', endTime: '17:30', isOff: false },
    ]);
    const updated = applyWeekOffToExistingSchedule(existing, [1]);
    const mon = updated.find((d) => d.dayOfWeek === 1);
    assert.equal(mon?.isOff, true);
    assert.equal(mon?.startTime, '09:30');
    assert.equal(mon?.endTime, '17:30');
  });

  test('copy schedule preserves off days when skipOffDays is true', () => {
    const days = normalizeScheduleDays();
    const copied = applyScheduleDayToTargets(days, 1, [0, 1, 2, 3, 4, 5, 6], {
      skipOffDays: true,
    });
    const sun = copied.find((d) => d.dayOfWeek === 0);
    const tue = copied.find((d) => d.dayOfWeek === 2);
    assert.equal(sun?.isOff, true);
    assert.equal(sun?.startTime, '11:00');
    assert.equal(tue?.startTime, '11:00');
    assert.equal(tue?.endTime, '20:00');
  });
});

describe('Workforce schedule save action contracts', () => {
  test('saveWeeklyScheduleAction bridges super_admin via staff.edit permission', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/workforce/actions/operations.ts'), 'utf8');
    assert.match(src, /resolveScheduleEditor/);
    assert.match(src, /requireWorkforcePermission\('staff\.edit'\)/);
    assert.match(src, /validateScheduleDays/);
    assert.match(src, /success: 'Working hours saved\.'/);
    const saveBlock = src.split('export async function saveWeeklyScheduleAction')[1]?.split(
      'export async function setCommissionAction',
    )[0];
    assert.ok(saveBlock);
    assert.doesNotMatch(saveBlock!, /requireActor/);
  });

  test('super_admin can edit schedules; staff cannot edit others', () => {
    const admin = mapLegacyHairPermissions('super_admin', []);
    const staff = defaultGrantsForAccessRole('staff');
    assert.ok(hasWorkforcePermission(admin, 'staff.edit'));
    assert.equal(hasWorkforcePermission(staff, 'staff.edit'), false);
  });

  test('parseScheduleDaysFromForm round-trips off flags and times', () => {
    const fd = new FormData();
    fd.set('day_1_start', '11:00');
    fd.set('day_1_end', '20:00');
    fd.set('day_0_off', '1');
    const days = parseScheduleDaysFromForm(fd);
    const mon = days.find((d) => d.dayOfWeek === 1);
    const sun = days.find((d) => d.dayOfWeek === 0);
    assert.equal(mon?.startTime, '11:00');
    assert.equal(mon?.endTime, '20:00');
    assert.equal(mon?.isOff, false);
    assert.equal(sun?.isOff, true);
  });

  test('create and update employee actions reconcile weekly off with working hours', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/workforce/actions/employees.ts'), 'utf8');
    assert.match(src, /reconcileScheduleWithWeekOff/);
    assert.match(src, /validateScheduleDays\(scheduleDays\)/);
  });
});

describe('Workforce weekly off appointment enforcement', () => {
  test('isWithinWorkingHours rejects weekly off days', async () => {
    const { isWithinWorkingHours } = await import('@/src/workforce/services/schedules');
    assert.equal(
      isWithinWorkingHours({ startTime: '10:00', endTime: '20:00', isOff: true }, '14:00'),
      false,
    );
    assert.equal(
      isWithinWorkingHours({ startTime: '10:00', endTime: '20:00', isOff: false }, '14:00'),
      true,
    );
  });

  test('appointment booking enforces workforce schedule before legacy table', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/hair/services/appointments.ts'), 'utf8');
    assert.match(src, /getWorkingHoursForDay/);
    assert.match(src, /closed: daySchedule\.isOff/);
  });

  test('schedule upsert mirrors workforce rows to legacy staff schedules', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/workforce/services/schedules.ts'), 'utf8');
    assert.match(src, /mirrorWeeklyScheduleToLegacyStaffSchedules/);
    assert.match(src, /saveStaffDaySchedule/);
  });

  test('ShiftScheduleSection keeps weekly off and working hours in one state model', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(process.cwd(), 'src/workforce/components/ShiftScheduleSection.tsx'),
      'utf8',
    );
    assert.match(src, /syncScheduleWithWeekOff/);
    assert.match(src, /weekOffDaysFromSchedule/);
    assert.match(src, /WeeklyScheduleGrid/);
  });
});

describe('Workforce schedule UI contracts', () => {
  test('WeeklyScheduleGrid supports keyboard navigation and copy controls', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const grid = readFileSync(
      join(process.cwd(), 'src/workforce/components/WeeklyScheduleGrid.tsx'),
      'utf8',
    );
    const editor = readFileSync(
      join(process.cwd(), 'src/workforce/components/WorkingHoursEditor.tsx'),
      'utf8',
    );
    assert.match(grid, /resolveAdjacentScheduleField/);
    assert.match(grid, /Copy to all working days/);
    assert.match(grid, /onKeyDown/);
    assert.match(editor, /useActionState\(saveWeeklyScheduleAction/);
    assert.match(editor, /role="status"/);
  });
});
