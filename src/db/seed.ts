import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { eq, sql } from 'drizzle-orm';
import { createClient } from './client';
import { hashPassword } from '@/src/lib/auth/crypto';
import {
  adminUsers,
  beds,
  bedPrices,
  floors,
  pgs,
  rooms,
  roomTypes,
} from './schema';

/**
 * Phase 1 seed.
 *
 * Creates the smallest possible end-to-end inventory snapshot that we can
 * point future phases (availability, booking, payments) at:
 *
 *   1 PG  →  3 Floors  →  12 Rooms  →  48 Beds  →  48 BedPrice rows
 *
 * Bed mix totals 48 = (2×1) + (2×2) + (2×3) + (2×4) + (2×6) + (2×8).
 * That gives us at least one room of every common sharing configuration so
 * later test scenarios can exercise singles, doubles, dorms, etc.
 *
 * The seed is idempotent: it bails out fast if the target PG slug already
 * exists. Use `npm run db:reset && npm run db:migrate && npm run db:seed`
 * for a clean rebuild.
 */

type RoomTypeKey =
  | 'single_ac'
  | 'double_ac'
  | 'triple_ac'
  | 'quad_non_ac'
  | 'six_sharing_non_ac'
  | 'eight_sharing_non_ac';

type RoomTypeDef = {
  key: RoomTypeKey;
  name: string;
  capacity: number;
  hasAc: boolean;
  hasAttachedBath: boolean;
  pricing: {
    dailyRatePaise: number;
    weeklyRatePaise: number;
    monthlyRatePaise: number;
    securityDepositPaise: number;
  };
};

const ROOM_TYPE_DEFS: RoomTypeDef[] = [
  {
    key: 'single_ac',
    name: 'Single AC',
    capacity: 1,
    hasAc: true,
    hasAttachedBath: true,
    pricing: {
      dailyRatePaise: 1_50_000, //   ₹1,500/day
      weeklyRatePaise: 9_00_000, //  ₹9,000/week
      monthlyRatePaise: 25_00_000, // ₹25,000/month
      securityDepositPaise: 25_00_000,
    },
  },
  {
    key: 'double_ac',
    name: 'Double Sharing AC',
    capacity: 2,
    hasAc: true,
    hasAttachedBath: true,
    pricing: {
      dailyRatePaise: 1_00_000, //   ₹1,000/day
      weeklyRatePaise: 6_00_000, //  ₹6,000/week
      monthlyRatePaise: 18_00_000, // ₹18,000/month
      securityDepositPaise: 18_00_000,
    },
  },
  {
    key: 'triple_ac',
    name: 'Triple Sharing AC',
    capacity: 3,
    hasAc: true,
    hasAttachedBath: true,
    pricing: {
      dailyRatePaise: 80_000, //     ₹800/day
      weeklyRatePaise: 4_50_000, //  ₹4,500/week
      monthlyRatePaise: 14_00_000, // ₹14,000/month
      securityDepositPaise: 14_00_000,
    },
  },
  {
    key: 'quad_non_ac',
    name: 'Quad Sharing Non-AC',
    capacity: 4,
    hasAc: false,
    hasAttachedBath: false,
    pricing: {
      dailyRatePaise: 60_000, //     ₹600/day
      weeklyRatePaise: 3_50_000, //  ₹3,500/week
      monthlyRatePaise: 11_00_000, // ₹11,000/month
      securityDepositPaise: 11_00_000,
    },
  },
  {
    key: 'six_sharing_non_ac',
    name: 'Six Sharing Non-AC',
    capacity: 6,
    hasAc: false,
    hasAttachedBath: false,
    pricing: {
      dailyRatePaise: 45_000, //     ₹450/day
      weeklyRatePaise: 2_50_000, //  ₹2,500/week
      monthlyRatePaise: 8_00_000, //  ₹8,000/month
      securityDepositPaise: 8_00_000,
    },
  },
  {
    key: 'eight_sharing_non_ac',
    name: 'Eight Sharing Non-AC (Dormitory)',
    capacity: 8,
    hasAc: false,
    hasAttachedBath: false,
    pricing: {
      dailyRatePaise: 35_000, //     ₹350/day
      weeklyRatePaise: 2_00_000, //  ₹2,000/week
      monthlyRatePaise: 6_50_000, //  ₹6,500/month
      securityDepositPaise: 6_50_000,
    },
  },
];

/**
 * Floor layout. Each entry is one room. Total: 12 rooms, 48 beds.
 *
 *   Floor 0 (Ground): G-01..G-04   →  1+2+3+4 = 10 beds
 *   Floor 1:          101..104     →  1+2+6+8 = 17 beds
 *   Floor 2:          201..204     →  3+4+6+8 = 21 beds
 *                                              ──────
 *                                                  48
 */
type RoomDef = { roomNumber: string; roomTypeKey: RoomTypeKey };
type FloorLayout = { floorNumber: number; label: string; rooms: RoomDef[] };

const FLOOR_LAYOUTS: FloorLayout[] = [
  {
    floorNumber: 0,
    label: 'Ground',
    rooms: [
      { roomNumber: 'G-01', roomTypeKey: 'single_ac' },
      { roomNumber: 'G-02', roomTypeKey: 'double_ac' },
      { roomNumber: 'G-03', roomTypeKey: 'triple_ac' },
      { roomNumber: 'G-04', roomTypeKey: 'quad_non_ac' },
    ],
  },
  {
    floorNumber: 1,
    label: 'First',
    rooms: [
      { roomNumber: '101', roomTypeKey: 'single_ac' },
      { roomNumber: '102', roomTypeKey: 'double_ac' },
      { roomNumber: '103', roomTypeKey: 'six_sharing_non_ac' },
      { roomNumber: '104', roomTypeKey: 'eight_sharing_non_ac' },
    ],
  },
  {
    floorNumber: 2,
    label: 'Second',
    rooms: [
      { roomNumber: '201', roomTypeKey: 'triple_ac' },
      { roomNumber: '202', roomTypeKey: 'quad_non_ac' },
      { roomNumber: '203', roomTypeKey: 'six_sharing_non_ac' },
      { roomNumber: '204', roomTypeKey: 'eight_sharing_non_ac' },
    ],
  },
];

const PG_SLUG = 'awesome-pg-koramangala';
const PRICE_EFFECTIVE_FROM = '2026-01-01';
const SEED_ADMIN_EMAIL = 'admin@awesomepg.local';

/**
 * Dev seed password. Production uses migrate-time bootstrap from
 * `ADMIN_INITIAL_PASSWORD` or the forgot-password flow.
 */
function resolveSeedAdminPassword(): string | null {
  const fromEnv = process.env.ADMIN_INITIAL_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') return null;
  return null;
}

async function seedAdminUser() {
  const { db, close } = createClient({ max: 1 });
  const password = resolveSeedAdminPassword();
  if (!password) {
    console.log(
      '  skip: admin user seed (set ADMIN_INITIAL_PASSWORD or run npm run db:migrate to bootstrap)',
    );
    await close();
    return;
  }

  const existing = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, SEED_ADMIN_EMAIL))
    .limit(1);
  if (existing.length > 0) {
    console.log(`  skip: admin user "${SEED_ADMIN_EMAIL}" already exists`);
    await close();
    return;
  }
  await db.insert(adminUsers).values({
    fullName: 'Super Admin',
    email: SEED_ADMIN_EMAIL,
    passwordHash: hashPassword(password),
    role: 'super_admin',
    pgScope: [],
    isActive: true,
    mustChangePassword: true,
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    console.log(
      `  ✓ admin user: ${SEED_ADMIN_EMAIL} (password from ADMIN_INITIAL_PASSWORD)`,
    );
  } else {
    console.log(
      `  ✓ admin user: ${SEED_ADMIN_EMAIL} (password from ADMIN_INITIAL_PASSWORD — change via admin console)`,
    );
  }
  await close();
}

async function main() {
  const { db, close } = createClient({ max: 1 });

  console.log('→ Seeding Phase 1 inventory…');

  await db.transaction(async (tx) => {
    // 1. Guard against re-seeding so the script is safe to run twice.
    const existing = await tx
      .select({ id: pgs.id })
      .from(pgs)
      .where(sql`${pgs.slug} = ${PG_SLUG}`)
      .limit(1);

    if (existing.length > 0) {
      console.log(`  skip: PG with slug "${PG_SLUG}" already exists. Nothing to do.`);
      return;
    }

    // 2. PG
    const [pg] = await tx
      .insert(pgs)
      .values({
        name: 'Awesome PG — Koramangala',
        slug: PG_SLUG,
        addressLine1: '4th Block, 80 Feet Road',
        addressLine2: 'Near Forum Mall',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560034',
        geoLat: '12.934533',
        geoLng: '77.626579',
        genderPolicy: 'coed',
        amenities: {
          wifi: true,
          roomCleaning: true,
          bathroomCleaning: true,
          bedTidy: true,
          bedSheetsWeekly: true,
          laundry: true,
          chairsInRooms: true,
          freeElectricity: true,
          waterCooler: true,
          fridge: true,
          airCoolerChillRoom: true,
          ac: true,
          cctv: true,
          gaming: true,
          chillRoom: true,
        },
        images: [
          'https://placehold.co/1200x800?text=Awesome+PG+Exterior',
          'https://placehold.co/1200x800?text=Common+Lounge',
          'https://placehold.co/1200x800?text=Chill+Room',
        ],
        description:
          'Modern co-living PG in the heart of Koramangala. Walkable to Forum Mall, Sony Signal, and Ejipura. ' +
          'Daily room & bathroom cleaning, weekly bedsheets, free laundry (bring liquid detergent & a laundry bag), ' +
          'high-speed WiFi, chilled water, fridge, chairs in every room, and electricity included — AC usage split per tenant.',
        isActive: true,
      })
      .returning({ id: pgs.id });

    console.log(`  ✓ inserted pg "${PG_SLUG}" (id=${pg.id})`);

    // 3. Room types (PG-scoped) — keyed by RoomTypeKey for later lookup.
    const insertedRoomTypes = await tx
      .insert(roomTypes)
      .values(
        ROOM_TYPE_DEFS.map((rt) => ({
          pgId: pg.id,
          name: rt.name,
          defaultCapacity: rt.capacity,
          hasAc: rt.hasAc,
          hasAttachedBath: rt.hasAttachedBath,
          defaultAmenities: {
            studyTable: true,
            wardrobe: true,
            balcony: false,
          },
        })),
      )
      .returning({ id: roomTypes.id, name: roomTypes.name });

    const roomTypeIdByKey = new Map<RoomTypeKey, string>();
    for (const def of ROOM_TYPE_DEFS) {
      const found = insertedRoomTypes.find((rt) => rt.name === def.name);
      if (!found) throw new Error(`Failed to insert room type ${def.name}`);
      roomTypeIdByKey.set(def.key, found.id);
    }
    console.log(`  ✓ inserted ${insertedRoomTypes.length} room types`);

    // 4. Floors + Rooms + Beds + Prices.
    let totalRooms = 0;
    let totalBeds = 0;
    let totalPrices = 0;

    for (const fl of FLOOR_LAYOUTS) {
      const [floor] = await tx
        .insert(floors)
        .values({
          pgId: pg.id,
          floorNumber: fl.floorNumber,
          label: fl.label,
        })
        .returning({ id: floors.id });

      for (const roomDef of fl.rooms) {
        const roomTypeId = roomTypeIdByKey.get(roomDef.roomTypeKey);
        if (!roomTypeId) throw new Error(`Unknown room type ${roomDef.roomTypeKey}`);
        const rtDef = ROOM_TYPE_DEFS.find((r) => r.key === roomDef.roomTypeKey)!;

        const [room] = await tx
          .insert(rooms)
          .values({
            floorId: floor.id,
            roomTypeId,
            roomNumber: roomDef.roomNumber,
          })
          .returning({ id: rooms.id });
        totalRooms += 1;

        // Beds. Code them B1..Bn so admins can read them at a glance.
        const bedValues = Array.from({ length: rtDef.capacity }, (_, i) => ({
          roomId: room.id,
          bedCode: `B${i + 1}`,
          status: 'available' as const,
        }));
        const insertedBeds = await tx
          .insert(beds)
          .values(bedValues)
          .returning({ id: beds.id });
        totalBeds += insertedBeds.length;

        // Initial pricing row per bed. All beds in the same room start at
        // the room-type rate; admins can override individual beds later
        // (e.g. window vs aisle).
        const priceValues = insertedBeds.map((b) => ({
          bedId: b.id,
          dailyRatePaise: rtDef.pricing.dailyRatePaise,
          weeklyRatePaise: rtDef.pricing.weeklyRatePaise,
          monthlyRatePaise: rtDef.pricing.monthlyRatePaise,
          securityDepositPaise: rtDef.pricing.securityDepositPaise,
          effectiveFrom: PRICE_EFFECTIVE_FROM,
          effectiveTo: null,
        }));
        await tx.insert(bedPrices).values(priceValues);
        totalPrices += priceValues.length;
      }

      console.log(`  ✓ floor ${fl.floorNumber} (${fl.label}): ${fl.rooms.length} rooms seeded`);
    }

    console.log('  ──────────────────────────────────────────');
    console.log(`  ✓ totals: 1 pg, ${FLOOR_LAYOUTS.length} floors, ${totalRooms} rooms, ${totalBeds} beds, ${totalPrices} price rows`);

    if (totalRooms !== 12 || totalBeds !== 48) {
      throw new Error(
        `Seed shape regression: expected 12 rooms / 48 beds, got ${totalRooms} / ${totalBeds}`,
      );
    }
  });

  console.log('✓ Inventory seed complete');
  await close();

  console.log('→ Seeding Phase 6 admin user…');
  await seedAdminUser();
  console.log('✓ Seed complete');
}

main().catch((err) => {
  console.error('✗ Seed failed:', err);
  process.exit(1);
});
