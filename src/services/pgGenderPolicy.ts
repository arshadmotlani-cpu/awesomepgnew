import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { beds, floors, pgs, rooms } from '@/src/db/schema';
import {
  type ResidentGender,
  validateResidentGenderForPgPolicy,
} from '@/src/lib/pg/genderPolicy';

/** Validate resident gender against the PG that owns a bed (check-in / assignment only). */
export async function validateResidentGenderForBed(
  bedId: string,
  residentGender: ResidentGender,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db
    .select({ genderPolicy: pgs.genderPolicy, pgName: pgs.name })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(and(eq(beds.id, bedId), isNull(beds.archivedAt), isNull(pgs.archivedAt)))
    .limit(1);

  if (!row) {
    return { ok: false, error: 'Bed not found.' };
  }

  return validateResidentGenderForPgPolicy(residentGender, row.genderPolicy);
}
