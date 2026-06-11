import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { pgs, type PgAmenities } from '@/src/db/schema';
import {
  mergeSharingPresets,
  type SharingPresetMatrix,
} from '@/src/lib/pgSharingPresets';
import { slugify } from '@/src/lib/slug';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';

export type PgFormInput = {
  name: string;
  slug?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  genderPolicy: 'male' | 'female' | 'coed';
  description?: string;
  contactPhone?: string;
  contactEmail?: string;
  amenities: PgAmenities;
  images: string[];
  videos: string[];
  isActive: boolean;
};

function assertPgAccess(session: AdminSession, pgId: string) {
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgId)) {
    throw new Error('You do not have access to this PG.');
  }
}

export async function getPgForAdmin(id: string, session: AdminSession) {
  assertPgAccess(session, id);
  const [row] = await db.select().from(pgs).where(and(eq(pgs.id, id), isNull(pgs.archivedAt))).limit(1);
  return row ?? null;
}

export async function createPg(session: AdminSession, input: PgFormInput) {
  const slug = input.slug?.trim() || slugify(input.name);
  if (!slug) throw new Error('A valid slug is required.');

  const [row] = await db
    .insert(pgs)
    .values({
      name: input.name.trim(),
      slug,
      addressLine1: input.addressLine1.trim(),
      addressLine2: input.addressLine2?.trim() || null,
      city: input.city.trim(),
      state: input.state.trim(),
      pincode: input.pincode.trim(),
      genderPolicy: input.genderPolicy,
      description: input.description?.trim() || null,
      contactPhone: input.contactPhone?.trim() || null,
      contactEmail: input.contactEmail?.trim() || null,
      amenities: input.amenities,
      images: input.images.filter(Boolean),
      videos: input.videos.filter(Boolean),
      isActive: input.isActive,
    })
    .returning({ id: pgs.id });

  return row.id;
}

export async function updatePg(session: AdminSession, id: string, input: PgFormInput) {
  assertPgAccess(session, id);
  const slug = input.slug?.trim() || slugify(input.name);

  await db
    .update(pgs)
    .set({
      name: input.name.trim(),
      slug,
      addressLine1: input.addressLine1.trim(),
      addressLine2: input.addressLine2?.trim() || null,
      city: input.city.trim(),
      state: input.state.trim(),
      pincode: input.pincode.trim(),
      genderPolicy: input.genderPolicy,
      description: input.description?.trim() || null,
      contactPhone: input.contactPhone?.trim() || null,
      contactEmail: input.contactEmail?.trim() || null,
      amenities: input.amenities,
      images: input.images.filter(Boolean),
      videos: input.videos.filter(Boolean),
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(eq(pgs.id, id));
}

export async function savePgSharingPresets(
  session: AdminSession,
  pgId: string,
  presets: SharingPresetMatrix,
) {
  assertPgAccess(session, pgId);
  const [row] = await db
    .select({ amenities: pgs.amenities })
    .from(pgs)
    .where(and(eq(pgs.id, pgId), isNull(pgs.archivedAt)))
    .limit(1);
  if (!row) throw new Error('PG not found.');

  const amenities = mergeSharingPresets(row.amenities ?? {}, presets);
  await db
    .update(pgs)
    .set({ amenities, updatedAt: new Date() })
    .where(eq(pgs.id, pgId));
}

export async function archivePg(session: AdminSession, id: string) {
  assertPgAccess(session, id);
  await db
    .update(pgs)
    .set({
      isActive: false,
      archivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(pgs.id, id));
}
