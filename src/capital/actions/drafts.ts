'use server';

import { requireCapitalAuth } from '@/src/capital/lib/auth/guards';
import { deleteDraft, loadDraft, saveDraft } from '@/src/capital/services/drafts';

export async function saveDraftAction(draftKey: string, payload: Record<string, unknown>) {
  await requireCapitalAuth();
  await saveDraft(draftKey, payload);
  return { ok: true };
}

export async function loadDraftAction(draftKey: string) {
  await requireCapitalAuth();
  const payload = await loadDraft(draftKey);
  return { payload };
}

export async function deleteDraftAction(draftKey: string) {
  await requireCapitalAuth();
  await deleteDraft(draftKey);
  return { ok: true };
}
