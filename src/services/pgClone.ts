import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedPrices,
  beds,
  floors,
  pgPaymentCategories,
  pgs,
  rooms,
  roomTypes,
} from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { slugify } from '@/src/lib/slug';
import { ensureDefaultPaymentCategoriesForPg } from '@/src/services/pgPaymentDefaults';

export type ClonePgInput = {
  name: string;
  slug?: string;
  genderPolicy?: 'male' | 'female' | 'coed';
  /** Appended to description when cloning for a gender-specific listing. */
  descriptionSuffix?: string;
};

export type ClonePgResult = {
  newPgId: string;
  slug: string;
  floors: number;
  rooms: number;
  beds: number;
  paymentCategories: number;
};

function assertPgAccess(session: AdminSession, pgId: string) {
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgId)) {
    throw new Error('You do not have access to this PG.');
  }
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  if (!slug) slug = 'pg';
  for (let i = 0; i < 20; i += 1) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    const [existing] = await db
      .select({ id: pgs.id })
      .from(pgs)
      .where(eq(pgs.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
  }
  throw new Error('Could not allocate a unique slug.');
}

async function loadActiveBedPriceTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  bedId: string,
) {
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await tx
    .select()
    .from(bedPrices)
    .where(
      and(
        eq(bedPrices.bedId, bedId),
        sql`${bedPrices.effectiveFrom} <= ${today}::date`,
        or(isNull(bedPrices.effectiveTo), sql`${bedPrices.effectiveTo} > ${today}::date`),
      ),
    )
    .orderBy(desc(bedPrices.effectiveFrom))
    .limit(1);
  return row ?? null;
}

/**
 * Deep-clone a PG: listing, amenities, floors, rooms, beds, prices, QR categories.
 * Does not copy bookings, meter logs, bills, or payment history.
 */
export async function clonePg(
  session: AdminSession,
  sourcePgId: string,
  input: ClonePgInput,
): Promise<ClonePgResult> {
  assertPgAccess(session, sourcePgId);

  const [source] = await db
    .select()
    .from(pgs)
    .where(and(eq(pgs.id, sourcePgId), isNull(pgs.archivedAt)))
    .limit(1);
  if (!source) throw new Error('Source PG not found.');

  const genderPolicy = input.genderPolicy ?? source.genderPolicy;
  const slug = await uniqueSlug(input.slug ?? input.name);
  const description = [source.description, input.descriptionSuffix].filter(Boolean).join('\n\n');

  const result = await db.transaction(async (tx) => {
    const [newPg] = await tx
      .insert(pgs)
      .values({
        name: input.name.trim(),
        slug,
        addressLine1: source.addressLine1,
        addressLine2: source.addressLine2,
        city: source.city,
        state: source.state,
        pincode: source.pincode,
        geoLat: source.geoLat,
        geoLng: source.geoLng,
        genderPolicy,
        amenities: source.amenities,
        images: source.images,
        videos: source.videos,
        description: description || null,
        contactPhone: source.contactPhone,
        contactEmail: source.contactEmail,
        hasPaymentEnabled: source.hasPaymentEnabled,
        ownerId: source.ownerId,
        isActive: source.isActive,
      })
      .returning({ id: pgs.id, slug: pgs.slug });

    const categories = await tx
      .select()
      .from(pgPaymentCategories)
      .where(eq(pgPaymentCategories.pgId, sourcePgId));

    if (categories.length > 0) {
      await tx.insert(pgPaymentCategories).values(
        categories.map((c) => ({
          pgId: newPg.id,
          name: c.name,
          qrCodeImageUrl: c.qrCodeImageUrl,
          upiId: c.upiId,
          isActive: c.isActive,
        })),
      );
    }

    const sourceRoomTypes = await tx
      .select()
      .from(roomTypes)
      .where(eq(roomTypes.pgId, sourcePgId));

    const roomTypeMap = new Map<string, string>();
    for (const rt of sourceRoomTypes) {
      const [inserted] = await tx
        .insert(roomTypes)
        .values({
          pgId: newPg.id,
          name: rt.name,
          defaultCapacity: rt.defaultCapacity,
          hasAc: rt.hasAc,
          hasAttachedBath: rt.hasAttachedBath,
          defaultAmenities: rt.defaultAmenities,
        })
        .returning({ id: roomTypes.id });
      roomTypeMap.set(rt.id, inserted.id);
    }

    const sourceFloors = await tx
      .select()
      .from(floors)
      .where(and(eq(floors.pgId, sourcePgId), isNull(floors.archivedAt)))
      .orderBy(asc(floors.floorNumber));

    const floorMap = new Map<string, string>();
    for (const floor of sourceFloors) {
      const [inserted] = await tx
        .insert(floors)
        .values({
          pgId: newPg.id,
          floorNumber: floor.floorNumber,
          label: floor.label,
        })
        .returning({ id: floors.id });
      floorMap.set(floor.id, inserted.id);
    }

    let roomCount = 0;
    let bedCount = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const [oldFloorId, newFloorId] of floorMap) {
      const sourceRooms = await tx
        .select()
        .from(rooms)
        .where(and(eq(rooms.floorId, oldFloorId), isNull(rooms.archivedAt)))
        .orderBy(asc(rooms.roomNumber));

      for (const room of sourceRooms) {
        const newRoomTypeId = roomTypeMap.get(room.roomTypeId);
        if (!newRoomTypeId) {
          throw new Error(`Room type missing for room ${room.roomNumber}.`);
        }

        const [newRoom] = await tx
          .insert(rooms)
          .values({
            floorId: newFloorId,
            roomTypeId: newRoomTypeId,
            roomNumber: room.roomNumber,
            notes: room.notes,
          })
          .returning({ id: rooms.id });
        roomCount += 1;

        const sourceBeds = await tx
          .select()
          .from(beds)
          .where(and(eq(beds.roomId, room.id), isNull(beds.archivedAt)))
          .orderBy(asc(beds.bedCode));

        for (const bed of sourceBeds) {
          const [newBed] = await tx
            .insert(beds)
            .values({
              roomId: newRoom.id,
              bedCode: bed.bedCode,
              status: bed.status,
              notes: bed.notes,
            })
            .returning({ id: beds.id });
          bedCount += 1;

          const price = await loadActiveBedPriceTx(tx, bed.id);
          if (price) {
            await tx.insert(bedPrices).values({
              bedId: newBed.id,
              dailyRatePaise: price.dailyRatePaise,
              weeklyRatePaise: price.weeklyRatePaise,
              monthlyRatePaise: price.monthlyRatePaise,
              securityDepositPaise: price.securityDepositPaise,
              dailySecurityDepositPaise: price.dailySecurityDepositPaise,
              weeklySecurityDepositPaise: price.weeklySecurityDepositPaise,
              monthlySecurityDepositPaise: price.monthlySecurityDepositPaise,
              effectiveFrom: today,
            });
          }
        }
      }
    }

    return {
      newPgId: newPg.id,
      slug: newPg.slug,
      floors: floorMap.size,
      rooms: roomCount,
      beds: bedCount,
      paymentCategories: categories.length,
    };
  });

  await ensureDefaultPaymentCategoriesForPg(result.newPgId);
  return result;
}

/** Find a single PG by partial name match (case-insensitive). */
export async function findPgByNamePattern(pattern: string) {
  const rows = await db
    .select({ id: pgs.id, name: pgs.name, slug: pgs.slug, genderPolicy: pgs.genderPolicy })
    .from(pgs)
    .where(isNull(pgs.archivedAt))
    .orderBy(asc(pgs.name));

  const needle = pattern.toLowerCase();
  const matches = rows.filter((r) => r.name.toLowerCase().includes(needle));
  if (matches.length === 0) {
    throw new Error(`No PG found matching "${pattern}".`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple PGs match "${pattern}": ${matches.map((m) => m.name).join(', ')}. Be more specific.`,
    );
  }
  return matches[0];
}
