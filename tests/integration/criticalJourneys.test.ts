/**
 * Critical journey regression net — pure-function coverage for booking,
 * extension, vacating, invoice sharing, payments, and resident profile flows.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import {
  defaultCheckOutDate,
  defaultExtensionUntilDate,
  normalizeBrowseStay,
} from '@/src/lib/dateDefaults';
import { deriveCustomerBedAvailabilityView } from '@/src/lib/bedAvailabilityState';
import {
  buildInvoicePublicUrl,
  legacyResidentInvoiceSharePath,
} from '@/src/lib/billing/sendInvoiceOnWhatsApp';
import { CANONICAL_PRODUCTION_URL, getAppUrl } from '@/src/lib/url';
import {
  canTransitionFinancialStatus,
  canTransitionRentStatus,
  guardRentStatusTransition,
} from '@/src/lib/billing/invoiceStateMachine';
import {
  canCheckIn,
  isProfileComplete,
  profileFieldsSatisfied,
} from '@/src/services/profile';

describe('1 — New resident booking URL + pricing mode mapping', () => {
  it('BedBookingPanel maps monthly stay to open_ended and fixed-date to fixed_stay', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/customer/BedBookingPanel.tsx'),
      'utf8',
    );
    assert.match(src, /pricingModeFromStayType/);
    assert.match(src, /monthly_stay/);
    assert.match(src, /fixed_date_stay/);
    assert.doesNotMatch(src, /title: 'Weekly'/);
    assert.doesNotMatch(src, /title: 'Daily'/);
  });

  it('normalizeBrowseStay falls back invalid dates and keeps fixed_stay mode', () => {
    const stay = normalizeBrowseStay({
      start: '2026-07-01',
      end: '2026-07-01',
      mode: 'fixed_stay',
    });
    assert.equal(stay.mode, 'fixed_stay');
    assert.equal(stay.end, defaultCheckOutDate('2026-07-01'));
  });

  it('builds booking/new query with bed ids and fixed_stay mode', () => {
    const params = new URLSearchParams();
    params.set('start', '2026-07-10');
    params.set('end', '2026-07-17');
    params.set('mode', 'fixed_stay');
    params.append('bed', 'bed-a');
    params.append('bed', 'bed-b');
    const url = `/booking/new?${params.toString()}`;
    const q = new URL(url, 'http://localhost').searchParams;
    assert.equal(q.get('mode'), 'fixed_stay');
    assert.deepEqual(q.getAll('bed'), ['bed-a', 'bed-b']);
  });

  it('BedBookingPanel buildReviewUrl still emits start/end/mode params', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/customer/BedBookingPanel.tsx'),
      'utf8',
    );
    const fn = src.slice(src.indexOf('function buildReviewUrl'));
    assert.match(fn, /params\.set\('start', input\.start\)/);
    assert.match(fn, /params\.set\('end', input\.checkout\)/);
    assert.match(fn, /params\.set\('mode', input\.mode\)/);
    assert.match(src, /const url = buildReviewUrl\(/);
  });
});

describe('2 — Booking extension suggested check-in', () => {
  it('defaultExtensionUntilDate is checkout + 7 days when possible', () => {
    assert.equal(defaultExtensionUntilDate('2026-06-01'), '2026-06-08');
  });

  it('suggested rebooking check-in is day after prior checkout', () => {
    const priorCheckout = '2026-06-15';
    const suggestedCheckIn = formatDate(addDays(parseDate(priorCheckout), 1));
    assert.equal(suggestedCheckIn, '2026-06-16');
    assert.ok(suggestedCheckIn > priorCheckout);
  });

  it('BedBookingPanel accepts suggestedCheckIn prop for timeline prefill', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/customer/BedBookingPanel.tsx'),
      'utf8',
    );
    assert.match(src, /suggestedCheckIn\?: string/);
    assert.match(src, /if \(suggestedCheckIn && suggestedCheckIn >= earliestCheckIn\)/);
  });
});

describe('3 — Vacating past-due and checkout settlement paths', () => {
  it('approved vacating past due shows move-out overdue on customer picker', () => {
    const view = deriveCustomerBedAvailabilityView({
      bedStatus: 'available',
      isAvailableNow: false,
      isOccupiedToday: true,
      vacatingDate: '2026-06-18',
      vacatingStatus: 'approved',
      reservedFrom: null,
    });
    assert.equal(view.kind, 'notice');
    assert.equal(view.label, 'Move-out overdue');
    assert.match(view.sublabel ?? '', /Move-out was/i);
    assert.doesNotMatch(view.sublabel ?? '', /checkout pending/i);
  });

  it('pending vacating past due prompts admin review', () => {
    const view = deriveCustomerBedAvailabilityView({
      bedStatus: 'available',
      isAvailableNow: false,
      isOccupiedToday: true,
      vacatingDate: '2026-06-18',
      vacatingStatus: 'pending',
      reservedFrom: null,
    });
    assert.match(view.sublabel ?? '', /admin review/i);
  });
});

describe('4 — Invoice sharing deep links', () => {
  const shareToken = 'abc123sharetoken';

  it('legacyResidentInvoiceSharePath redirects to public token URL', () => {
    const invoiceId = '550e8400-e29b-41d4-a716-446655440000';
    assert.equal(legacyResidentInvoiceSharePath(invoiceId), `/resident/invoices/${invoiceId}`);
  });

  it('buildInvoicePublicUrl uses /i/{shareToken} only', () => {
    const url = buildInvoicePublicUrl(shareToken, 'https://awesomepg.in');
    assert.equal(url, `https://awesomepg.in/i/${shareToken}`);
  });

  it('getAppUrl on Vercel production is canonical www', () => {
    const prevEnv = process.env.VERCEL_ENV;
    const prevApp = process.env.NEXT_PUBLIC_APP_URL;
    try {
      process.env.VERCEL_ENV = 'production';
      delete process.env.NEXT_PUBLIC_APP_URL;
      assert.equal(getAppUrl(), CANONICAL_PRODUCTION_URL);
    } finally {
      if (prevEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = prevEnv;
      if (prevApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = prevApp;
    }
  });
});

describe('5 — Payment recording invoice state machine', () => {
  it('allows pending → payment_in_progress → paid', () => {
    assert.equal(canTransitionRentStatus('pending', 'payment_in_progress'), true);
    assert.equal(canTransitionRentStatus('payment_in_progress', 'paid'), true);
  });

  it('blocks paid → cancelled transitions', () => {
    assert.equal(canTransitionFinancialStatus('paid', 'cancelled'), false);
    assert.deepEqual(guardRentStatusTransition('paid', 'cancelled'), {
      ok: false,
      error: 'Invalid rent invoice transition paid → cancelled',
    });
  });
});

describe('6 — Resident profile data shape expectations', () => {
  const base = {
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+919876543210',
    profileCompletedAt: null as Date | null,
  };

  it('requires name, email, and valid mobile when stamp is null', () => {
    assert.equal(isProfileComplete(base), true);
    assert.equal(profileFieldsSatisfied(base), true);
    assert.equal(isProfileComplete({ ...base, email: 'bad' }), false);
  });

  it('canCheckIn only allows approved KYC', () => {
    assert.equal(canCheckIn({ kycStatus: 'approved' }), true);
    assert.equal(canCheckIn({ kycStatus: 'pending' }), false);
  });
});
