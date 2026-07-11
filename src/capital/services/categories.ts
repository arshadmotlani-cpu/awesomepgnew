import { capitalDb } from '@/src/capital/db/client';
import { acCategories } from '@/src/capital/db/schema';
import { asc, eq } from 'drizzle-orm';

export async function listCategories() {
  return capitalDb
    .select()
    .from(acCategories)
    .where(eq(acCategories.isActive, true))
    .orderBy(asc(acCategories.sortOrder));
}
