'use server';

import { revalidatePath } from 'next/cache';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import {
  HairPermissionError,
  hasPermission,
} from '@/src/hair/lib/auth/permissions';
import { createCustomer, createCustomerQuick } from '@/src/hair/services/customers';

export type SalonCustomerCreateResult =
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

export type SalonCustomerCreateContext = 'quick_sale' | 'appointment_booking' | 'advance_payment';

const CONTEXT_LABEL: Record<SalonCustomerCreateContext, string> = {
  quick_sale: 'Quick Sale',
  appointment_booking: 'Appointment booking',
  advance_payment: 'Advance payment',
};

async function requireSalonCustomerCreatePermission() {
  const admin = await requireHairAuth();
  const allowed =
    hasPermission(admin, 'page:quick_sale') ||
    hasPermission(admin, 'page:appointments') ||
    hasPermission(admin, 'page:customers');
  if (!allowed) {
    throw new HairPermissionError('Missing permission to create customers');
  }
  return admin;
}

function parseGender(raw: string): 'female' | 'male' | 'other' | 'prefer_not_to_say' {
  const g = raw.trim();
  if (g === 'male' || g === 'other' || g === 'prefer_not_to_say') return g;
  return 'female';
}

function hasExtendedFields(formData: FormData): boolean {
  const email = String(formData.get('email') ?? '').trim();
  const dob = String(formData.get('dateOfBirth') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();
  return Boolean(email || dob || notes);
}

/** Shared salon customer create — Quick Sale, appointments, advance payment. */
export async function createSalonCustomerFromForm(
  formData: FormData,
): Promise<SalonCustomerCreateResult> {
  try {
    await requireSalonCustomerCreatePermission();

    const fullName = String(formData.get('fullName') ?? '').trim();
    const phone = String(formData.get('phone') ?? '').trim();
    const gender = parseGender(String(formData.get('gender') ?? 'female'));
    const contextRaw = String(formData.get('context') ?? 'quick_sale').trim();
    const context: SalonCustomerCreateContext =
      contextRaw === 'appointment_booking' || contextRaw === 'advance_payment'
        ? contextRaw
        : 'quick_sale';
    const label = CONTEXT_LABEL[context];

    if (!fullName) return { ok: false, error: 'Customer name is required' };
    if (!phone) return { ok: false, error: 'Phone number is required' };

    let row;

    if (hasExtendedFields(formData)) {
      row = await createCustomer({
        fullName,
        phone,
        gender,
        email: String(formData.get('email') ?? '').trim() || null,
        dateOfBirth: String(formData.get('dateOfBirth') ?? '').trim() || null,
        notes: String(formData.get('notes') ?? '').trim() || null,
        source: 'walk_in',
        forceCreate: true,
      });
    } else {
      row = await createCustomerQuick({
        fullName,
        phone,
        gender,
        createdVia: label,
      });
    }

    revalidatePath('/customers');
    revalidatePath('/dashboard/revenue');
    revalidatePath('/appointments');

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

/** @deprecated Prefer createSalonCustomerFromForm */
export async function createQuickCustomerFromForm(
  formData: FormData,
): Promise<SalonCustomerCreateResult> {
  if (!formData.has('context')) {
    formData.set('context', 'quick_sale');
  }
  return createSalonCustomerFromForm(formData);
}

export type QuickCustomerCreateResult = SalonCustomerCreateResult;
