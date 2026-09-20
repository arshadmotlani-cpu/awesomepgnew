'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/src/hair/lib/auth/permissions';
import { getTenantContextForAction } from '@/src/hair/lib/tenant/getTenantContext';
import {
  validateVendorFormValues,
  vendorFormValuesFromFormData,
  type VendorFormFieldKey,
  type VendorFormValues,
} from '@/src/hair/lib/vendorConfigurationForm';
import { uploadVendorAttachment } from '@/src/hair/lib/vendorAttachmentUpload';
import {
  createVendor,
  updateVendor,
  vendorInputFromFormValues,
} from '@/src/hair/services/vendors';

export type VendorMasterActionState = {
  error?: string;
  success?: string;
  vendor?: { id: string; name: string };
  fieldErrors?: Partial<Record<VendorFormFieldKey, string>>;
  values?: VendorFormValues;
};

async function resolveQrCodeUrl(
  formData: FormData,
  vendorId: string,
): Promise<string | null> {
  const stored = String(formData.get('qrCodeStoredUrl') ?? '').trim();
  if (stored) return stored;
  const file = formData.get('qrCodeFile');
  if (file instanceof File && file.size > 0) {
    const uploaded = await uploadVendorAttachment(file, 'vendor-qr', vendorId);
    return uploaded.url;
  }
  return null;
}

export async function createVendorMasterAction(
  _prev: VendorMasterActionState,
  formData: FormData,
): Promise<VendorMasterActionState> {
  const values = vendorFormValuesFromFormData(formData);
  try {
    await requirePermission('page:inventory');
    const ctx = await getTenantContextForAction();
    const validated = validateVendorFormValues(values);
    if (!validated.ok) {
      return {
        error: 'Fix the highlighted fields',
        values: validated.values,
        fieldErrors: validated.fieldErrors,
      };
    }

    const vendor = await createVendor(
      vendorInputFromFormValues(validated.values, null),
      ctx,
    );
    const qrCodeUrl = await resolveQrCodeUrl(formData, vendor.id);
    if (qrCodeUrl && qrCodeUrl !== vendor.qrCodeUrl) {
      await updateVendor(
        vendor.id,
        vendorInputFromFormValues(validated.values, qrCodeUrl),
        ctx,
      );
    }

    revalidatePath('/products');
    revalidatePath('/vendors');
    return {
      success: 'Vendor created.',
      vendor: { id: vendor.id, name: vendor.name },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create vendor';
    const fieldErrors: Partial<Record<VendorFormFieldKey, string>> = {};
    if (message.includes('name already exists')) fieldErrors.name = message;
    if (message.includes('Phone')) fieldErrors.phone = message;
    return {
      error: message,
      values,
      fieldErrors: Object.keys(fieldErrors).length ? fieldErrors : undefined,
    };
  }
}
