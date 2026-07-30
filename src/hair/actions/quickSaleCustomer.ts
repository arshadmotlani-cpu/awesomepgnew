'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/src/hair/lib/auth/permissions';
import { createCustomerQuick } from '@/src/hair/services/customers';

export type QuickCustomerCreateResult =
  | {
      ok: true;
      customer: {
        id: string;
        fullName: string;
        customerCode: string | null;
        phone: string;
      };
    }
  | { ok: false; error: string };

/** Quick Sale add-customer — JSON-safe result (no redirect, no Date/BigInt). */
export async function createQuickCustomerFromForm(
  formData: FormData,
): Promise<QuickCustomerCreateResult> {
  try {
    await requirePermission('page:quick_sale');
    const fullName = String(formData.get('fullName') ?? '').trim();
    const phone = String(formData.get('phone') ?? '').trim();
    const genderRaw = String(formData.get('gender') ?? 'female').trim();
    const gender =
      genderRaw === 'male' || genderRaw === 'other' || genderRaw === 'prefer_not_to_say'
        ? genderRaw
        : 'female';

    const row = await createCustomerQuick({ fullName, phone, gender });
    revalidatePath('/customers');
    revalidatePath('/dashboard');

    return {
      ok: true,
      customer: {
        id: row.id,
        fullName: row.fullName,
        customerCode: row.customerCode ?? null,
        phone: row.phone,
      },
    };
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Could not create customer',
    };
  }
}
