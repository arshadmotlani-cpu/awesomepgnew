import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  BOOKING_STATUSES,
  CLOSED_BOOKING_STATUSES,
  adminBookingStatusBadgeTone,
  bookingCancellationBlockedReason,
  bookingTimelineDetailForStatus,
  bookingTimelineKindForStatus,
  customerBookingBannerCopy,
  customerBookingStatusTone,
  isBookingCancellableStatus,
  isBookingStatus,
  isClosedBookingStatus,
  labelBookingStatus,
  myBookingStatusChipClass,
} from '../../src/lib/booking/bookingStatus.ts';
import { isBookingLifecycleCheckedOut } from '../../src/lib/checkout/checkoutSource.ts';
import {
  buildMyBookingCardModels,
  normalizeMyBookingRow,
  partitionMyBookingCardModels,
} from '../../src/lib/account/myBookingRowPresentation.ts';

describe('booking status SSOT', () => {
  test('enum includes superseded as first-class value', () => {
    assert.ok(BOOKING_STATUSES.includes('superseded'));
    assert.ok(isBookingStatus('superseded'));
    assert.equal(labelBookingStatus('superseded'), 'Superseded');
  });

  test('superseded is closed and not cancellable', () => {
    assert.ok(isClosedBookingStatus('superseded'));
    assert.equal(isBookingCancellableStatus('superseded'), false);
    assert.match(
      bookingCancellationBlockedReason('APG-1', 'superseded'),
      /superseded by a newer confirmed booking/i,
    );
  });

  test('isBookingLifecycleCheckedOut treats superseded as terminal', () => {
    assert.equal(
      isBookingLifecycleCheckedOut({ bookingStatus: 'superseded' }),
      true,
    );
  });

  test('customer booking presentation never uses confirmed styling for superseded', () => {
    const tone = customerBookingStatusTone('superseded');
    assert.equal(tone.label, 'Superseded');
    assert.match(tone.bg, /violet/);
    assert.notEqual(tone.bg, customerBookingStatusTone('confirmed').bg);

    const banner = customerBookingBannerCopy('superseded');
    assert.equal(banner.headline, 'Superseded');
    assert.match(banner.copy, /replaced by a newer confirmed booking/i);
    assert.equal(banner.variant, 'superseded');
    assert.notEqual(banner.variant, 'confirmed');
    assert.notEqual(banner.paymentStatusLabel, 'Paid');
  });

  test('admin badge tone for superseded is violet terminal', () => {
    assert.equal(adminBookingStatusBadgeTone('superseded'), 'violet');
    assert.notEqual(adminBookingStatusBadgeTone('superseded'), 'emerald');
    assert.notEqual(adminBookingStatusBadgeTone('superseded'), 'amber');
  });

  test('timeline renders superseded as cancelled terminal event', () => {
    assert.equal(bookingTimelineKindForStatus('superseded'), 'cancelled');
    assert.match(
      bookingTimelineDetailForStatus('superseded') ?? '',
      /newer confirmed booking/i,
    );
  });

  test('every booking status has chip class without fallback', () => {
    for (const status of BOOKING_STATUSES) {
      assert.ok(myBookingStatusChipClass(status).length > 0);
      assert.ok(labelBookingStatus(status).length > 0);
      assert.ok(customerBookingStatusTone(status).label.length > 0);
    }
  });
});

describe('My Bookings superseded UX', () => {
  test('superseded row is recognized without unknown-status warning', () => {
    const model = normalizeMyBookingRow({
      id: 'b-super',
      bookingCode: 'APG-2026-0044',
      status: 'superseded',
      durationMode: 'monthly',
      totalPaise: 100_000,
      pgName: 'Test PG',
      bedCount: 1,
      checkInDate: '2026-06-01',
    });
    assert.equal(model.status, 'superseded');
    assert.equal(model.statusLabel, 'Superseded');
    assert.equal(model.isClosed, true);
    assert.equal(model.warnings.length, 0);
  });

  test('partition places superseded in closed bookings', () => {
    const models = buildMyBookingCardModels([
      {
        id: 'open',
        bookingCode: 'APG-NEW',
        status: 'confirmed',
        durationMode: 'monthly',
        totalPaise: 1,
        pgName: 'PG',
        bedCount: 1,
        checkInDate: '2026-06-01',
      },
      {
        id: 'old',
        bookingCode: 'APG-OLD',
        status: 'superseded',
        durationMode: 'monthly',
        totalPaise: 1,
        pgName: 'PG',
        bedCount: 1,
        checkInDate: '2026-05-01',
      },
    ]);
    const { open, closed } = partitionMyBookingCardModels(models);
    assert.equal(open.length, 1);
    assert.equal(open[0]?.status, 'confirmed');
    assert.equal(closed.length, 1);
    assert.equal(closed[0]?.status, 'superseded');
  });

  test('closed booking statuses match SSOT list', () => {
    for (const status of CLOSED_BOOKING_STATUSES) {
      const model = normalizeMyBookingRow({
        id: status,
        bookingCode: `CODE-${status}`,
        status,
        durationMode: 'monthly',
        totalPaise: 1,
        pgName: 'PG',
        bedCount: 1,
        checkInDate: '2026-06-01',
      });
      assert.equal(model.isClosed, true, status);
    }
  });
});

const SRC_ROOT = join(process.cwd(), 'src');
const AUDIT_SKIP = new Set([
  'src/lib/booking/bookingStatus.ts',
  'src/lib/booking/supersededBookingLifecycle.ts',
]);

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkTsFiles(full, out);
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function rel(path: string): string {
  return path.replace(`${process.cwd()}/`, '');
}

describe('booking status static architecture audit', () => {
  test('customer booking page has no confirmed fallback for unknown status', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/(customer)/booking/[bookingCode]/page.tsx'),
      'utf8',
    );
    assert.doesNotMatch(src, /STATUS_TONE\[b\.status\] \?\? STATUS_TONE\.confirmed/);
    assert.match(src, /customerBookingStatusTone/);
    assert.match(src, /superseded/);
  });

  test('my bookings presentation knows every enum status', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/account/myBookingRowPresentation.ts'),
      'utf8',
    );
    assert.match(src, /isBookingStatus/);
    assert.doesNotMatch(src, /unrecognized booking status/i);
  });

  test('src has no booking.status confirmed fallback tone pattern', () => {
    const offenders: string[] = [];
    for (const file of walkTsFiles(SRC_ROOT)) {
      const relative = rel(file);
      if (AUDIT_SKIP.has(relative)) continue;
      const src = readFileSync(file, 'utf8');
      if (/STATUS_TONE\[.*\] \?\? STATUS_TONE\.confirmed/.test(src)) {
        offenders.push(relative);
      }
    }
    assert.deepEqual(offenders, []);
  });

  test('booking lifecycle checkout helper lists superseded', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/checkout/checkoutSource.ts'),
      'utf8',
    );
    assert.match(src, /superseded/);
  });
});
