/**
 * Regression sweep for every read-path query touched by the
 * "column reference 'id' is ambiguous" bug.
 *
 * Runs against the real, seeded database (1 PG, 3 floors, 12 rooms, 48 beds).
 * Exits non-zero on the first assertion failure so it can be wired into CI.
 */
import 'dotenv/config';

import {
  getDashboardStats,
  listPgs,
  listFloors,
  listRooms,
  listBeds,
  listPricingTiers,
  getOccupancyByPg,
  getOccupancyByFloor,
  listStayExtensions,
  // Phase 5.5
  listAdminRentInvoices,
  getRentStats,
  listAdminElectricityBills,
  listAdminVacatingRequests,
  listAdminDepositSummaries,
  listRoomsForElectricityForm,
} from '../src/db/queries/admin';
import {
  listPublicPgs,
  getPgBySlug,
  listRoomsForPg,
  getRoomDetail,
  getBedsForCart,
  listExtensionsForBooking,
  // Phase 5.5
  listResidentBookingsForCustomer,
} from '../src/db/queries/customer';
import { closeDb } from '../src/db/client';

const FAIL: string[] = [];
const OK: string[] = [];

function assert(cond: boolean, label: string, detail?: unknown) {
  if (cond) {
    OK.push(label);
  } else {
    FAIL.push(`${label} — ${JSON.stringify(detail)}`);
  }
}

async function main() {
  // ── Admin: dashboard ────────────────────────────────────────────────────
  const stats = await getDashboardStats();
  assert(stats.ok, 'getDashboardStats() returns ok', stats);
  if (stats.ok) {
    assert(stats.data.totalPgs === 1, 'dashboard.totalPgs === 1', stats.data);
    assert(stats.data.totalFloors === 3, 'dashboard.totalFloors === 3', stats.data);
    assert(stats.data.totalRooms === 12, 'dashboard.totalRooms === 12', stats.data);
    assert(stats.data.totalBeds === 48, 'dashboard.totalBeds === 48', stats.data);
    assert(stats.data.occupiedBeds >= 0, 'dashboard.occupiedBeds is a number', stats.data);
  }

  // ── Admin: listPgs (previously silently 0/0/0) ─────────────────────────
  const pgList = await listPgs();
  assert(pgList.ok, 'listPgs() returns ok', pgList);
  if (pgList.ok) {
    const pg = pgList.data[0];
    assert(pg !== undefined, 'listPgs has at least 1 row', pgList.data);
    if (pg) {
      assert(pg.floorCount === 3, 'pg.floorCount === 3 (was silently 0)', pg);
      assert(pg.roomCount === 12, 'pg.roomCount === 12 (was silently 0)', pg);
      assert(pg.bedCount === 48, 'pg.bedCount === 48 (was silently 0)', pg);
    }
  }

  // ── Admin: listFloors ───────────────────────────────────────────────────
  const floorList = await listFloors();
  assert(floorList.ok, 'listFloors() returns ok', floorList);
  if (floorList.ok) {
    assert(floorList.data.length === 3, 'listFloors → 3 rows', floorList.data);
    const totalRooms = floorList.data.reduce((a, f) => a + f.roomCount, 0);
    const totalBeds = floorList.data.reduce((a, f) => a + f.bedCount, 0);
    assert(totalRooms === 12, 'sum(floor.roomCount) === 12', totalRooms);
    assert(totalBeds === 48, 'sum(floor.bedCount) === 48', totalBeds);
  }

  // ── Admin: listRooms ────────────────────────────────────────────────────
  const roomList = await listRooms();
  assert(roomList.ok, 'listRooms() returns ok', roomList);
  if (roomList.ok) {
    assert(roomList.data.length === 12, 'listRooms → 12 rows', roomList.data.length);
    const totalBeds = roomList.data.reduce((a, r) => a + r.bedCount, 0);
    assert(totalBeds === 48, 'sum(room.bedCount) === 48', totalBeds);
  }

  // ── Admin: listBeds (isOccupiedToday correlated EXISTS) ─────────────────
  const bedList = await listBeds();
  assert(bedList.ok, 'listBeds() returns ok', bedList);
  if (bedList.ok) {
    assert(bedList.data.length === 48, 'listBeds → 48 rows', bedList.data.length);
  }

  // ── Admin: pricing tiers (count(beds.id) in GROUP BY) ───────────────────
  const tiers = await listPricingTiers();
  assert(tiers.ok, 'listPricingTiers() returns ok', tiers);
  if (tiers.ok) {
    const totalBedsAcrossTiers = tiers.data.reduce((a, t) => a + t.bedCount, 0);
    assert(totalBedsAcrossTiers === 48, 'sum(pricingTier.bedCount) === 48', totalBedsAcrossTiers);
  }

  // ── Admin: occupancy ────────────────────────────────────────────────────
  const occPg = await getOccupancyByPg();
  assert(occPg.ok, 'getOccupancyByPg() returns ok', occPg);
  if (occPg.ok) {
    const row = occPg.data[0];
    assert(row !== undefined, 'occupancy-by-pg has 1 row', occPg.data);
    if (row) {
      assert(row.totalBeds === 48, 'occupancy.totalBeds === 48', row);
    }
  }

  const occFloor = await getOccupancyByFloor();
  assert(occFloor.ok, 'getOccupancyByFloor() returns ok', occFloor);
  if (occFloor.ok) {
    const totalBeds = occFloor.data.reduce((a, f) => a + f.totalBeds, 0);
    assert(totalBeds === 48, 'sum(occupancyFloor.totalBeds) === 48', totalBeds);
  }

  // ── Customer: listPublicPgs (the failing query in /pgs) ────────────────
  const publicPgs = await listPublicPgs();
  assert(publicPgs.ok, 'listPublicPgs() returns ok', publicPgs);
  if (publicPgs.ok) {
    const p = publicPgs.data[0];
    assert(p !== undefined, 'listPublicPgs → 1 row', publicPgs.data);
    if (p) {
      assert(p.totalBeds === 48, 'publicPg.totalBeds === 48', p);
      assert(p.availableBeds >= 0 && p.availableBeds <= 48, 'publicPg.availableBeds in [0,48]', p);
      assert(p.startingFromPaise > 0, 'publicPg.startingFromPaise > 0', p);
    }
  }

  // Pick a slug for downstream tests
  let slug: string | undefined;
  if (publicPgs.ok) slug = publicPgs.data[0]?.slug;
  if (!slug) {
    FAIL.push('No slug available for getPgBySlug/listRoomsForPg/getRoomDetail');
  } else {
    const pgDetail = await getPgBySlug(slug);
    assert(pgDetail.ok, 'getPgBySlug() returns ok', pgDetail);

    const range = { start: '2026-09-01', end: '2026-09-30' };
    const roomsForPg = await listRoomsForPg(
      pgDetail.ok && pgDetail.data ? pgDetail.data.id : '',
      range.start,
    );
    assert(roomsForPg.ok, 'listRoomsForPg() returns ok', roomsForPg);
    if (roomsForPg.ok) {
      assert(roomsForPg.data.length === 12, 'listRoomsForPg → 12 rooms', roomsForPg.data.length);
      const totalBeds = roomsForPg.data.reduce((a, r) => a + r.totalBeds, 0);
      assert(totalBeds === 48, 'sum(room.totalBeds) === 48', totalBeds);
      const availableBeds = roomsForPg.data.reduce((a, r) => a + r.availableBeds, 0);
      assert(availableBeds <= 48, 'sum(room.availableBeds) <= 48', availableBeds);
      const someRoom = roomsForPg.data.find((r) => r.monthlyRatePaise > 0);
      assert(someRoom !== undefined, 'at least one room exposes a monthly rate', roomsForPg.data);
    }

    // getRoomDetail
    if (roomsForPg.ok && roomsForPg.data[0]) {
      const firstRoom = roomsForPg.data[0];
      const detail = await getRoomDetail(slug, firstRoom.roomId, range.start);
      assert(detail.ok, 'getRoomDetail() returns ok', detail);
      if (detail.ok && detail.data) {
        assert(detail.data.beds.length === firstRoom.totalBeds,
          `getRoomDetail beds.length === ${firstRoom.totalBeds}`, detail.data.beds);
        const aRate = detail.data.beds.find((b) => b.monthlyRatePaise > 0);
        assert(aRate !== undefined, 'at least one bed exposes a monthly rate', detail.data.beds);
      }

      // getBedsForCart with the first two beds
      if (detail.ok && detail.data && detail.data.beds.length >= 2) {
        const bedIds = detail.data.beds.slice(0, 2).map((b) => b.bedId);
        const cart = await getBedsForCart(bedIds);
        assert(cart.ok, 'getBedsForCart() returns ok', cart);
        if (cart.ok) {
          assert(cart.data.length === 2, 'getBedsForCart → 2 rows', cart.data.length);
        }
      }
    }
  }

  // ── Phase 5: extension queries don't blow up on empty input ────────────
  const adminExts = await listStayExtensions();
  assert(adminExts.ok, 'listStayExtensions() returns ok', adminExts);
  if (adminExts.ok) {
    assert(
      Array.isArray(adminExts.data),
      'listStayExtensions returns an array',
      adminExts,
    );
    // No-arg call should accept undefined; status filter should also work.
    const filtered = await listStayExtensions({ status: 'pending' });
    assert(filtered.ok, 'listStayExtensions({status:pending}) returns ok', filtered);
  }
  const extsForUnknown = await listExtensionsForBooking(
    '00000000-0000-0000-0000-000000000000',
  );
  assert(
    extsForUnknown.ok && extsForUnknown.data.length === 0,
    'listExtensionsForBooking(unknown id) returns []',
    extsForUnknown,
  );

  // ── Phase 5.5: resident-billing reads ──────────────────────────────────
  const rentInv = await listAdminRentInvoices({});
  assert(rentInv.ok && Array.isArray(rentInv.data), 'listAdminRentInvoices() returns ok', rentInv);

  const rentInvFiltered = await listAdminRentInvoices({ status: 'pending' });
  assert(
    rentInvFiltered.ok && rentInvFiltered.data.every((r) => r.status === 'pending'),
    'listAdminRentInvoices({status:pending}) only returns pending rows',
    rentInvFiltered.ok ? rentInvFiltered.data.slice(0, 2) : rentInvFiltered,
  );

  const rentStats = await getRentStats();
  assert(
    rentStats.ok
      && typeof rentStats.data.collectedPaise === 'number'
      && typeof rentStats.data.outstandingPaise === 'number'
      && typeof rentStats.data.pendingCount === 'number'
      && typeof rentStats.data.overdueCount === 'number',
    'getRentStats() returns money + count totals',
    rentStats,
  );

  const eleBills = await listAdminElectricityBills();
  assert(
    eleBills.ok && Array.isArray(eleBills.data),
    'listAdminElectricityBills() returns ok',
    eleBills,
  );

  const vacReq = await listAdminVacatingRequests({});
  assert(
    vacReq.ok && Array.isArray(vacReq.data),
    'listAdminVacatingRequests() returns ok',
    vacReq,
  );

  const deposits = await listAdminDepositSummaries();
  assert(
    deposits.ok && Array.isArray(deposits.data),
    'listAdminDepositSummaries() returns ok',
    deposits,
  );

  const rooms = await listRoomsForElectricityForm();
  assert(
    rooms.ok && rooms.data.length === 12,
    'listRoomsForElectricityForm() returns all 12 seeded rooms',
    rooms.ok ? rooms.data.length : rooms,
  );

  // listResidentBookingsForCustomer expects a CUSTOMER id, not a phone.
  // An unknown UUID must return an empty array (no crash).
  const noResidents = await listResidentBookingsForCustomer(
    '00000000-0000-0000-0000-000000000000',
  );
  assert(
    noResidents.ok && noResidents.data.length === 0,
    'listResidentBookingsForCustomer(unknown id) returns []',
    noResidents,
  );

  console.log('\n=== Regression sweep results ===');
  for (const o of OK) console.log(`  PASS  ${o}`);
  if (FAIL.length) {
    console.log();
    for (const f of FAIL) console.error(`  FAIL  ${f}`);
    console.error(`\n${FAIL.length} failure(s), ${OK.length} pass.`);
    process.exit(1);
  }
  console.log(`\n${OK.length} checks passed.`);
}

main()
  .catch((err) => {
    console.error('Sweep crashed:', err);
    process.exitCode = 2;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
