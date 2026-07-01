/**
 * P0 acceptance — observable booking date-picker behavior (no UI framework).
 * Simulates StayDateRangePicker controller + BedBookingPanel parent state.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addDays, formatDate } from '@/src/lib/dates';
import { maxCheckoutBeforeOverlap } from '@/src/lib/bedStayOverlap';
import {
  isCheckInAvailable,
  isCheckOutAvailable,
  pickStayRange,
  type ReservationSpan,
} from '@/src/lib/stayDateSelection';
import { defaultCheckOutDate } from '@/src/lib/dateDefaults';

const RESERVATIONS: ReservationSpan[] = [{ startDate: '2026-07-15', endDate: '2026-07-20' }];
const HORIZON_END = '2026-08-01';
const EARLIEST = '2026-07-01';

type ParentState = { start: string; end: string };

/** Mirrors StayDateRangePicker onPick + commitRange + modal open flag. */
class PickerController {
  open = false;
  draftStart: string | null = null;
  draftEnd: string | null = null;
  parent: ParentState;

  constructor(parent: ParentState) {
    this.parent = parent;
  }

  openModal() {
    this.open = true;
    this.draftStart = this.parent.start;
    this.draftEnd = this.parent.end;
  }

  canSelect(date: string, phase: 'start' | 'end') {
    if (phase === 'start') return isCheckInAvailable(date, RESERVATIONS, EARLIEST);
    if (!this.draftStart) return false;
    return isCheckOutAvailable(date, this.draftStart, RESERVATIONS, HORIZON_END);
  }

  commitRange(start: string, end: string | null) {
    this.parent.start = start;
    if (end) this.parent.end = end;
  }

  pick(date: string) {
    const result = pickStayRange(
      { start: this.draftStart, end: this.draftEnd },
      date,
      (d, p) => this.canSelect(d, p),
    );
    if (!result) return { picked: false as const };

    this.draftStart = result.draft.start;
    this.draftEnd = result.draft.end;

    if (result.complete && result.draft.start && result.draft.end) {
      this.commitRange(result.draft.start, result.draft.end);
      this.open = false;
      return { picked: true, complete: true, closed: true };
    }
    return { picked: true, complete: false, closed: false };
  }

  triggerLabel() {
    const s = this.open ? this.draftStart ?? this.parent.start : this.parent.start;
    const e = this.open ? this.draftEnd ?? this.parent.end : this.parent.end;
    return `${s} → ${e}`;
  }

  nights() {
    const s = this.parent.start;
    const e = this.parent.end;
    if (!s || !e || e <= s) return 0;
    return Math.round(
      (Date.parse(e) - Date.parse(s)) / (24 * 60 * 60 * 1000),
    );
  }
}

function buildBookingUrl(parent: ParentState, bedIds: string[]) {
  const params = new URLSearchParams();
  params.set('start', parent.start);
  params.set('end', parent.end);
  params.set('mode', 'fixed_stay');
  for (const bed of bedIds) params.append('bed', bed);
  return `/booking/new?${params.toString()}`;
}

test('P0-1 fixed stay: open → check-in → check-out → modal closes → summary updates', () => {
  const parent = { start: '2026-07-01', end: defaultCheckOutDate('2026-07-01') };
  const picker = new PickerController(parent);

  assert.equal(picker.open, false);
  picker.openModal();
  assert.equal(picker.open, true);

  const r1 = picker.pick('2026-07-10');
  assert.equal(r1.picked, true);
  assert.equal(r1.complete, false);
  assert.equal(picker.open, true);
  assert.equal(picker.draftStart, '2026-07-10');
  assert.equal(picker.draftEnd, null);

  const r2 = picker.pick('2026-07-14');
  assert.equal(r2.picked, true);
  assert.equal(r2.complete, true);
  assert.equal(r2.closed, true);
  assert.equal(picker.open, false);
  assert.equal(parent.start, '2026-07-10');
  assert.equal(parent.end, '2026-07-14');
  assert.equal(picker.triggerLabel(), '2026-07-10 → 2026-07-14');
  assert.equal(picker.nights(), 4);
});

test('P0-3 checkout date updates parent state on second pick (state flow)', () => {
  const trace: string[] = [];
  const parent = { start: '2026-07-05', end: '2026-07-12' };
  const picker = new PickerController(parent);

  const log = () =>
    trace.push(
      `open=${picker.open} draft=(${picker.draftStart},${picker.draftEnd}) parent=(${parent.start},${parent.end})`,
    );

  picker.openModal();
  log();
  picker.pick('2026-07-08');
  log();
  const endBeforeSecond = parent.end;
  const startBeforeSecond = parent.start;
  picker.pick('2026-07-13');
  log();

  assert.equal(startBeforeSecond, '2026-07-05');
  assert.equal(endBeforeSecond, '2026-07-12');
  assert.equal(parent.start, '2026-07-08');
  assert.equal(parent.end, '2026-07-13');
  assert.match(trace[1]!, /draft=\(2026-07-08,null\)/);
  assert.match(trace[1]!, /parent=\(2026-07-05,2026-07-12\)/);
  assert.match(trace[2]!, /parent=\(2026-07-08,2026-07-13\)/);
  assert.match(trace[2]!, /open=false/);
});

test('P0-4 URL query parameters remain correct after continue', () => {
  const parent = { start: '2026-07-10', end: '2026-07-14' };
  const url = buildBookingUrl(parent, ['bed-a', 'bed-b']);
  const q = new URL(url, 'http://localhost').searchParams;
  assert.equal(q.get('start'), '2026-07-10');
  assert.equal(q.get('end'), '2026-07-14');
  assert.equal(q.get('mode'), 'fixed_stay');
  assert.deepEqual(q.getAll('bed'), ['bed-a', 'bed-b']);
});

test('P0-5 unavailable dates cannot be selected', () => {
  const picker = new PickerController({ start: '2026-07-01', end: '2026-07-08' });
  picker.openModal();
  assert.equal(picker.pick('2026-06-30').picked, false);
  assert.equal(picker.pick('2026-07-16').picked, false);
  picker.pick('2026-07-10');
  assert.equal(picker.pick('2026-07-21').picked, false);
});

test('P0-6 reservation boundaries block checkout into reserved span', () => {
  const cap = maxCheckoutBeforeOverlap('2026-07-10', RESERVATIONS, HORIZON_END);
  assert.equal(cap, '2026-07-15');
  assert.equal(isCheckOutAvailable('2026-07-14', '2026-07-10', RESERVATIONS, HORIZON_END), true);
  assert.equal(isCheckOutAvailable('2026-07-15', '2026-07-10', RESERVATIONS, HORIZON_END), true);
  assert.equal(isCheckOutAvailable('2026-07-16', '2026-07-10', RESERVATIONS, HORIZON_END), false);

  const picker = new PickerController({ start: '2026-07-01', end: '2026-07-08' });
  picker.openModal();
  picker.pick('2026-07-10');
  assert.equal(picker.pick('2026-07-21').picked, false);
});

test('P0-7 checkout cap logic enforced', () => {
  const cap = maxCheckoutBeforeOverlap('2026-07-10', RESERVATIONS, HORIZON_END);
  assert.equal(cap, '2026-07-15');
  assert.equal(isCheckOutAvailable('2026-07-15', '2026-07-10', RESERVATIONS, HORIZON_END), true);
  assert.equal(isCheckOutAvailable('2026-07-16', '2026-07-10', RESERVATIONS, HORIZON_END), false);

  const parent = { start: '2026-07-10', end: '2026-07-21' };
  const cap2 = maxCheckoutBeforeOverlap(parent.start, RESERVATIONS, HORIZON_END);
  assert.ok(cap2 && parent.end > cap2);
});

test('P0-7b distant future reservation does not cap unrelated stay', () => {
  const distant = [{ startDate: '2027-06-16', endDate: '2027-07-01' }];
  assert.equal(
    isCheckOutAvailable('2026-06-08', '2026-06-01', distant, '2028-01-01'),
    true,
  );
});

test('P0-8 no Done button in StayDateRangePicker source', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/components/customer/StayDateRangePicker.tsx'),
    'utf8',
  );
  assert.doesNotMatch(src, />\s*Done\s*</);
  assert.doesNotMatch(src, /aria-label="Done"/);
  assert.doesNotMatch(src, /type="date"/);
});

test('P0-9 no separate check-in/check-out input workflow in picker source', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/components/customer/StayDateRangePicker.tsx'),
    'utf8',
  );
  assert.match(src, /Stay dates/);
  assert.equal((src.match(/type="date"/g) ?? []).length, 0);
  assert.equal((src.match(/onCheckInChange|onCheckOutChange/g) ?? []).length >= 2, true);
  assert.doesNotMatch(src, /setPicking/);
});

test('P0-10 complete booking range without reverting check-in phase', () => {
  const parent = { start: '2026-07-01', end: defaultCheckOutDate('2026-07-01') };
  const picker = new PickerController(parent);
  picker.openModal();
  picker.pick('2026-07-03');
  assert.equal(picker.draftStart, '2026-07-03');
  assert.equal(picker.draftEnd, null);
  picker.pick('2026-07-07');
  assert.equal(picker.open, false);
  assert.equal(parent.start, '2026-07-03');
  assert.equal(parent.end, '2026-07-07');
  const url = buildBookingUrl(parent, ['bed-1']);
  assert.match(url, /start=2026-07-03/);
  assert.match(url, /end=2026-07-07/);
});

test('P0-2 mobile layout classes present for bottom sheet + iPhone/Android widths', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/components/customer/StayDateRangePicker.tsx'),
    'utf8',
  );
  assert.match(src, /justify-end/);
  assert.match(src, /rounded-t-3xl/);
  assert.match(src, /92dvh/);
  assert.match(src, /LAYER_Z\.nestedOverlay/);
  assert.match(src, /LAYER_Z\.nestedDialog/);
  assert.match(src, /min-h-\[44px\]/);
  assert.match(src, /Edit stay dates/);
  assert.match(src, /sm:items-center/);
  assert.match(src, /sm:max-w-\[520px\]/);
});
