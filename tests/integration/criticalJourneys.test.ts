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
  residentInvoiceSharePath,
} from '@/src/lib/billing/sendInvoiceOnWhatsApp';
import { getPublicCustomerBaseUrl } from '@/src/lib/appUrl';
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
  it('BedBookingPanel maps monthly plan to open_ended checkout params', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/customer/BedBookingPanel.tsx'),
      'utf8',
    );
    assert.match(src, /const mode: PricingMode = intent === 'indefinite' \? 'open_ended' : 'fixed_stay'/);
    assert.match(src, /plan === 'monthly' \? 'indefinite' : 'fixed'/);
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

  it('BedBookingPanel validateAndContinue still emits start/end/mode params', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/customer/BedBookingPanel.tsx'),
      'utf8',
    );
    const fn = src.slice(src.indexOf('function validateAndContinue'));
    assert.match(fn, /params\.set\('start', start\)/);
    assert.match(fn, /params\.set\('end', checkout\)/);
    assert.match(fn, /params\.set\('mode', mode\)/);
    assert.match(fn, /router\.push\(`\/booking\/new\?\$\{params\.toString\(\)\}`\)/);
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
    assert.match(src, /if \(suggestedCheckIn && suggestedCheckIn >= initialStart\)/);
  });
});

describe('3 — Vacating past-due and checkout settlement paths', () => {
  it('approved vacating past due shows checkout pending on customer picker', () => {
    const view = deriveCustomerBedAvailabilityView({
      bedStatus: 'available',
      isAvailableNow: false,
      vacatingDate: '2026-06-18',
      vacatingStatus: 'approved',
      reservedFrom: null,
    });
    assert.equal(view.kind, 'notice');
    assert.equal(view.label, 'Move-out overdue');
    assert.match(view.sublabel ?? '', /checkout pending/i);
  });

  it('pending vacating past due prompts admin review', () => {
    const view = deriveCustomerBedAvailabilityView({
      bedStatus: 'available',
      isAvailableNow: false,
      vacatingDate: '2026-06-18',
      vacatingStatus: 'pending',
      reservedFrom: null,
    });
    assert.match(view.sublabel ?? '', /admin review/i);
  });
});

describe('4 — Invoice sharing deep links', () => {
  const invoiceId = '550e8400-e29b-41d4-a716-446655440000';

  it('residentInvoiceSharePath is stable permanent path', () => {
    assert.equal(residentInvoiceSharePath(invoiceId), `/resident/invoices/${invoiceId}`);
  });

  it('buildInvoicePublicUrl uses public customer base + resident path', () => {
    const url = buildInvoicePublicUrl(invoiceId, 'resident', 'https://awesomepg.in');
    assert.equal(url, `https://awesomepg.in/resident/invoices/${invoiceId}`);
  });

  it('getPublicCustomerBaseUrl prefers NEXT_PUBLIC_APP_URL over VERCEL_URL', () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    try {
      process.env.NEXT_PUBLIC_APP_URL = 'https://awesomepg.in';
      assert.equal(getPublicCustomerBaseUrl(), 'https://awesomepg.in');
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = prev;
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
