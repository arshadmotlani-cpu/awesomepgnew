import { asc, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhResources, type FyhResourceType } from '@/src/hair/db/schema';

export async function listResourcesAdmin() {
  return hairDb
    .select()
    .from(fyhResources)
    .orderBy(asc(fyhResources.sortOrder), asc(fyhResources.name));
}

export async function createResource(input: {
  name: string;
  type: FyhResourceType;
  color?: string | null;
}) {
  const [row] = await hairDb
    .insert(fyhResources)
    .values({
      name: input.name.trim(),
      type: input.type,
      color: input.color?.trim() || null,
    })
    .returning();
  return row!;
}

export async function setResourceActive(resourceId: string, isActive: boolean) {
  await hairDb
    .update(fyhResources)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(fyhResources.id, resourceId));
}
