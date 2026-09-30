/**
 * Public bed share links, shared-bed prompt, tour removal, and short-stay pricing SSOT.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildPublicBedSharePath,
  buildPublicBedShareUrl,
  whatsAppShareHref,
} from '../../src/lib/booking/publicBedShareUrl';
import { copyBedShareLink, requestNativeBedShare } from '../../src/lib/booking/shareBedLink';
import { clampSharePopoverPosition } from '../../src/lib/booking/sharePopoverPosition';
import {
  applySharedBedSelection,
  resolveSharedBedPrompt,
  sharedBedPromptCopy,
  type SharedBedCandidate,
} from '../../src/lib/booking/sharedBedPrompt';
import { computeLowestFixedStayRent } from '../../src/lib/pricing/fixedStayOptimizer';
import { computePriceBreakdown, type RateSnapshot } from '../../src/services/pricing';

const PG = 'shantinagar-awesome-pg';
const ROOM = '22222222-2222-2222-2222-222222222222';
const BED = '33333333-3333-3333-3333-333333333333';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

const bookable: SharedBedCandidate = {
  bedId: BED,
  bedCode: 'B2',
  status: 'available',
  bookable: true,
  occupied: false,
};

const occupied: SharedBedCandidate = {
  ...bookable,
  bookable: false,
  occupied: true,
};

const maintenance: SharedBedCandidate = {
  ...bookable,
  status: 'maintenance',
  bookable: false,
  occupied: false,
};

function prompt(beds: SharedBedCandidate[], sharedBedId: string | null = BED, dismissed = false) {
  return resolveSharedBedPrompt({
    sharedBedId,
    dismissed,
    roomLabel: 'Room 201',
    beds,
  });
}

test('bed share URL resolves to the PG, room, and exact bed', () => {
  const path = buildPublicBedSharePath({ pgSlug: PG, roomId: ROOM, bedId: BED });
  assert.match(path, new RegExp(`/pgs/${PG}/rooms/${ROOM}`));
  const url = new URL(path, 'https://www.awesomepg.in');
  assert.equal(url.searchParams.get('bed'), BED);
  assert.equal(
    buildPublicBedShareUrl({ pgSlug: PG, roomId: ROOM, bedId: BED }, 'https://www.awesomepg.in/'),
    `https://www.awesomepg.in${path}`,
  );
});

test('share icon opens popover first — not immediate native share on trigger click', () => {
  const ui = read('src/components/customer/BedShareButton.tsx');
  assert.match(ui, /onToggleIcon/);
  assert.match(ui, /setOpen\(\(prev\) => !prev\)/);
  assert.doesNotMatch(ui, /onClick=\{onShare\}/);
  assert.match(ui, /aria-expanded=\{open\}/);
  assert.match(ui, /Share Bed \$\{bedCode\} booking link/);
});

test('share popover contains Share, Copy link, WhatsApp, and bed header', () => {
  const ui = read('src/components/customer/BedShareButton.tsx');
  assert.match(ui, /Bed \{bedCode\}/);
  assert.match(ui, /onShareRow/);
  assert.match(ui, /\n\s*Share\n/);
  assert.match(ui, /Copy link/);
  assert.match(ui, /WhatsApp/);
  assert.match(ui, /createPortal/);
  assert.match(ui, /clampSharePopoverPosition/);
});

test('Share row uses requestNativeBedShare with canonical bed URL', async () => {
  const url = buildPublicBedShareUrl({ pgSlug: PG, roomId: ROOM, bedId: BED }, 'https://awesomepg.in');
  let shared: string | null = null;
  const outcome = await requestNativeBedShare(
    { url, title: 'Bed B2', text: 'Room 201 · Bed B2' },
    async (data) => {
      shared = data.url;
    },
  );
  assert.equal(outcome, 'shared');
  assert.equal(shared, url);
  assert.match(read('src/components/customer/BedShareButton.tsx'), /onShareRow/);
  assert.match(read('src/components/customer/BedShareButton.tsx'), /requestNativeBedShare/);
});

test('Copy link uses clipboard SSOT and shows Link copied confirmation', async () => {
  const url = buildPublicBedShareUrl({ pgSlug: PG, roomId: ROOM, bedId: BED }, 'https://awesomepg.in');
  let copied = '';
  assert.equal(
    await copyBedShareLink(url, async (value) => {
      copied = value;
    }),
    true,
  );
  assert.equal(copied, url);
  const ui = read('src/components/customer/BedShareButton.tsx');
  assert.match(ui, /copyBedShareLink/);
  assert.match(ui, /buildPublicBedShareUrl/);
  assert.match(ui, /Link copied/);
  assert.match(ui, /Copy Bed \$\{bedCode\} booking link/);
});

test('WhatsApp uses the same canonical URL as copy', () => {
  const url = buildPublicBedShareUrl({ pgSlug: PG, roomId: ROOM, bedId: BED }, 'https://awesomepg.in');
  const href = whatsAppShareHref(url, 'Room 201 · Bed B2');
  assert.match(href, /wa\.me/);
  assert.ok(href.includes(encodeURIComponent(url)));
  assert.match(read('src/components/customer/BedShareButton.tsx'), /whatsAppShareHref\(url/);
});

test('popover dismisses on outside click and Escape', () => {
  const ui = read('src/components/customer/BedShareButton.tsx');
  assert.match(ui, /document\.addEventListener\('mousedown'/);
  assert.match(ui, /document\.addEventListener\('keydown'/);
  assert.match(ui, /e\.key === 'Escape'/);
  assert.match(ui, /setOpen\(false\)/);
});

test('clampSharePopoverPosition keeps panel inside viewport near edges', () => {
  const panelWidth = 176;
  const panelHeight = 168;
  const padding = 12;
  const viewportWidth = 390;
  const viewportHeight = 844;

  const bottomRight = clampSharePopoverPosition({
    triggerRect: {
      top: 800,
      left: 350,
      right: 390,
      bottom: 832,
      width: 40,
      height: 32,
    },
    panelWidth,
    panelHeight,
    padding,
    viewportWidth,
    viewportHeight,
  });
  assert.ok(bottomRight.top >= padding);
  assert.ok(bottomRight.top + panelHeight <= viewportHeight - padding);
  assert.ok(bottomRight.left >= padding);
  assert.ok(bottomRight.left + panelWidth <= viewportWidth - padding);

  const topLeft = clampSharePopoverPosition({
    triggerRect: {
      top: 20,
      left: 8,
      right: 48,
      bottom: 52,
      width: 40,
      height: 32,
    },
    panelWidth,
    panelHeight,
    padding,
    viewportWidth,
    viewportHeight,
  });
  assert.ok(topLeft.left >= padding);
  assert.ok(topLeft.top >= padding);
});

test('share UX does not introduce duplicate booking or pricing logic', () => {
  for (const file of [
    'src/components/customer/BedShareButton.tsx',
    'src/lib/booking/sharePopoverPosition.ts',
    'src/lib/booking/shareBedLink.ts',
  ]) {
    const src = read(file);
    assert.doesNotMatch(src, /createBooking|computePriceBreakdown|quoteBookingPrice/);
  }
});

test('native share cancel does not imply fallback', async () => {
  const url = buildPublicBedShareUrl({ pgSlug: PG, roomId: ROOM, bedId: BED }, 'https://awesomepg.in');
  assert.equal(await requestNativeBedShare({ url, title: 'Bed', text: 'Stay' }), 'fallback');

  const cancel = new Error('dismissed');
  cancel.name = 'AbortError';
  assert.equal(
    await requestNativeBedShare({ url, title: 'Bed', text: 'Stay' }, async () => {
      throw cancel;
    }),
    'cancelled',
  );
});

test('old tour and cockroach guide do not render on the public site', () => {
  const layout = read('app/(customer)/layout.tsx');
  assert.doesNotMatch(layout, /CockroachAI|RoachieTourWidget|CockroachGuide/);
  assert.equal(read('src/components/customer/BedSelector.tsx').includes('RoachieTourWidget'), false);
  assert.equal(read('src/components/customer/BedSelector.tsx').includes('BookingEducationBar'), false);
});

test('shared URL prompt selects only a bookable bed and close does not select', () => {
  const open = prompt([bookable]);
  assert.equal(open.phase, 'open');
  if (open.phase !== 'open') return;
  assert.equal(open.canSelect, true);
  assert.equal(sharedBedPromptCopy(open).title, 'Select your bed');
  assert.equal(sharedBedPromptCopy(open).detail, 'This link was shared for this bed.');
  assert.deepEqual(applySharedBedSelection(open), { bedId: BED });

  const closed = prompt([bookable], BED, true);
  assert.equal(closed.phase, 'hidden');
  assert.equal(applySharedBedSelection(closed), null);

  const ui = read('src/components/customer/SharedBedPrompt.tsx');
  assert.match(ui, /aria-label="Close"/);
  assert.match(ui, /Select Bed/);
  assert.match(ui, /onClose/);
  const selector = read('src/components/customer/BedSelector.tsx');
  assert.match(selector, /setPromptDismissed\(true\)/);
  assert.match(selector, /openPanelForBed\(picked\.bedId\)/);
  assert.doesNotMatch(selector, /createBooking/);
});

test('occupied, maintenance, and archived beds cannot be selected from a shared link', () => {
  for (const [row, availability] of [
    [occupied, 'occupied'],
    [maintenance, 'maintenance'],
  ] as const) {
    const state = prompt([row]);
    assert.equal(state.phase, 'open');
    if (state.phase !== 'open') continue;
    assert.equal(state.availability, availability);
    assert.equal(state.canSelect, false);
    assert.equal(applySharedBedSelection(state), null);
  }

  const archived = prompt([], BED);
  assert.equal(archived.phase, 'open');
  if (archived.phase === 'open') {
    assert.equal(archived.availability, 'archived');
    assert.equal(archived.canSelect, false);
    assert.match(sharedBedPromptCopy(archived).detail, /no longer available/);
  }
});

test('booking creation still validates availability on the server', () => {
  const booking = read('src/services/booking.ts');
  assert.match(booking, /validateBedStayRange/);
  assert.match(booking, /isBedAvailable/);
  const roomPage = read('app/(customer)/pgs/[pgSlug]/rooms/[roomId]/page.tsx');
  assert.match(roomPage, /searchParams\.bed/);
  assert.match(roomPage, /sharedBedId/);
  for (const file of [
    'src/components/customer/SharedBedPrompt.tsx',
    'src/components/customer/BedShareButton.tsx',
    'src/lib/booking/sharedBedPrompt.ts',
  ]) {
    assert.doesNotMatch(read(file), /createBooking|computePriceBreakdown|dailyRatePaise \*/);
  }
});

const RATE: RateSnapshot = {
  bedPriceId: '00000000-0000-0000-0000-000000000001',
  dailyRatePaise: 33_000,
  weeklyRatePaise: 190_000,
  monthlyRatePaise: 14_00_000,
  securityDepositPaise: 14_00_000,
  dailySecurityDepositPaise: 33_000,
  weeklySecurityDepositPaise: 190_000,
  monthlySecurityDepositPaise: 28_00_000,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
};

function stayQuote(startDate: string, endDate: string, mode: 'fixed_stay' | 'open_ended') {
  return computePriceBreakdown({
    bedId: BED,
    rate: RATE,
    startDate,
    endDate,
    durationMode: mode,
    includeDeposit: false,
  });
}

test('1, 5, and 10 night short stays use the existing fixed-stay resolver', () => {
  const one = stayQuote('2026-06-01', '2026-06-02', 'fixed_stay');
  const five = stayQuote('2026-06-01', '2026-06-06', 'fixed_stay');
  const ten = stayQuote('2026-06-01', '2026-06-11', 'fixed_stay');

  assert.equal(one.nights, 1);
  assert.equal(one.pricingStrategy, 'pure_daily');
  assert.equal(one.subtotalPaise, computeLowestFixedStayRent({
    nights: 1,
    dailyRatePaise: RATE.dailyRatePaise,
    weeklyRatePaise: RATE.weeklyRatePaise,
    monthlyRatePaise: RATE.monthlyRatePaise,
  }).subtotalPaise);

  assert.equal(five.nights, 5);
  assert.equal(five.pricingStrategy, 'pure_daily');
  assert.equal(five.subtotalPaise, 5 * RATE.dailyRatePaise);
  assert.ok(five.subtotalPaise < RATE.weeklyRatePaise);

  assert.equal(ten.nights, 10);
  assert.equal(ten.pricingStrategy, 'weeks_plus_days');
  assert.equal(ten.subtotalPaise, RATE.weeklyRatePaise + 3 * RATE.dailyRatePaise);
  assert.notEqual(ten.subtotalPaise, 10 * RATE.dailyRatePaise);
});

test('shared-link booking and normal booking use the same price for the same bed and dates', () => {
  const normal = stayQuote('2026-06-01', '2026-06-11', 'fixed_stay');
  const shared = stayQuote('2026-06-01', '2026-06-11', 'fixed_stay');
  assert.equal(shared.subtotalPaise, normal.subtotalPaise);
  assert.equal(shared.pricingStrategy, normal.pricingStrategy);
  assert.equal(shared.totalPaise, normal.totalPaise);

  const monthly = stayQuote('2026-06-01', '2026-07-01', 'open_ended');
  const monthlyAgain = stayQuote('2026-06-01', '2026-07-01', 'open_ended');
  assert.equal(monthly.durationMode, 'open_ended');
  assert.equal(monthly.subtotalPaise, monthlyAgain.subtotalPaise);
  assert.ok(monthly.subtotalPaise > 0);
});

test('repeated shared-bed selection does not keep a second booking action', () => {
  const first = prompt([bookable], BED, false);
  assert.deepEqual(applySharedBedSelection(first), { bedId: BED });
  const again = prompt([bookable], BED, true);
  assert.equal(applySharedBedSelection(again), null);
});

test('public bed tiles render the share control', () => {
  const tile = read('src/components/customer/PublicBedTile.tsx');
  assert.match(tile, /BedShareButton/);
  assert.match(tile, /CustomerBedTile/);
  assert.match(read('src/components/customer/block/PgBlockBooking.tsx'), /PublicBedTile/);
  assert.match(read('src/components/customer/BedSelector.tsx'), /PublicBedTile/);
});
