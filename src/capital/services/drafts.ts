import { eq } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import { acDrafts } from '@/src/capital/db/schema';

export async function saveDraft(draftKey: string, payload: Record<string, unknown>) {
  const [existing] = await capitalDb
    .select()
    .from(acDrafts)
    .where(eq(acDrafts.draftKey, draftKey))
    .limit(1);

  if (existing) {
    await capitalDb
      .update(acDrafts)
      .set({ payload, updatedAt: new Date() })
      .where(eq(acDrafts.draftKey, draftKey));
    return existing.id;
  }

  const [row] = await capitalDb.insert(acDrafts).values({ draftKey, payload }).returning();
  return row.id;
}

export async function loadDraft(draftKey: string) {
  const [row] = await capitalDb
    .select()
    .from(acDrafts)
    .where(eq(acDrafts.draftKey, draftKey))
    .limit(1);
  return row?.payload ?? null;
}

export async function deleteDraft(draftKey: string) {
  await capitalDb.delete(acDrafts).where(eq(acDrafts.draftKey, draftKey));
}
