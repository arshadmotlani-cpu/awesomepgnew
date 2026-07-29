'use server';

import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import { searchHair, type HairSearchHit } from '@/src/hair/services/search';

export async function searchHairAction(query: string): Promise<HairSearchHit[]> {
  await requireHairAuth();
  return searchHair(query);
}
