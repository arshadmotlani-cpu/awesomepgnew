'use server';

import { revalidatePath } from 'next/cache';
import { requireCapitalAuth } from '@/src/capital/lib/auth/guards';
import { formDataToObject, parseZod } from '@/src/capital/lib/validation/parse';
import { changePasswordSchema, updateSettingsSchema, uploadDocumentSchema } from '@/src/capital/lib/validation/schemas';
import { uploadDocument } from '@/src/capital/services/documents';
import { changeAdminPassword, updateSettings } from '@/src/capital/services/settings';
import { sanitizeFileName, validateUploadFile } from '@/src/capital/lib/api/guard';

export type ActionState = { error?: string; success?: string };

export async function updateSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(updateSettingsSchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };

    await updateSettings(parsed.data);
    revalidatePath('/settings');
    revalidatePath('/dashboard');
    return { success: 'Settings updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update settings' };
  }
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireCapitalAuth();
    const parsed = parseZod(changePasswordSchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };

    await changeAdminPassword(admin.id, parsed.data.currentPassword, parsed.data.newPassword);
    return { success: 'Password changed successfully.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to change password' };
  }
}

export async function uploadDocumentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const meta = parseZod(uploadDocumentSchema, {
      assetId: formData.get('assetId'),
      documentType: formData.get('documentType'),
      notes: formData.get('notes'),
    });
    if (!meta.ok) return { error: meta.error };

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return { error: 'Please select a file to upload.' };
    }

    const uploadError = validateUploadFile(file);
    if (uploadError) return { error: uploadError };

    const bytes = Buffer.from(await file.arrayBuffer());
    const assetId = meta.data.assetId && meta.data.assetId !== '' ? meta.data.assetId : undefined;
    const safeName = sanitizeFileName(file.name);

    await uploadDocument({
      assetId,
      documentType: meta.data.documentType,
      fileName: safeName,
      mimeType: file.type || 'application/octet-stream',
      fileBytes: bytes,
      notes: meta.data.notes,
    });

    revalidatePath('/documents');
    if (assetId) revalidatePath(`/assets/${assetId}`);
    return { success: 'Document uploaded.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to upload document' };
  }
}
