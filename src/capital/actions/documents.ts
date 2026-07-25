'use server';

import { revalidatePath } from 'next/cache';
import { requireCapitalAuth } from '@/src/capital/lib/auth/guards';
import { setAssetCoverPhoto } from '@/src/capital/services/documents';

export async function setCoverPhotoAction(assetId: string, documentId: string) {
  try {
    await requireCapitalAuth();
    await setAssetCoverPhoto(assetId, documentId);
    revalidatePath(`/assets/${assetId}`);
    revalidatePath('/assets');
    return { success: 'Cover photo updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to set cover photo' };
  }
}
