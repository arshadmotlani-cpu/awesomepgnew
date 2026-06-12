'use server';

import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getCustomerSession } from '@/src/lib/auth/session';
import { requireCustomerOwnsBookingCode } from '@/src/lib/auth/guards';
import { requireCompleteProfile } from '@/src/services/profile';
import { kycCustomerErrorMessage } from '@/src/lib/kyc/errors';
import {
  KYC_FILE_TOO_LARGE_MESSAGE,
  validateKycUploadSize,
} from '@/src/lib/kyc/uploadLimits';
import { submitKyc } from '@/src/services/kyc';

export type KycActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string };

async function fileFromForm(formData: FormData, key: string) {
  const raw = formData.get(key);
  if (!(raw instanceof File) || raw.size === 0) {
    return null;
  }
  const sizeError = validateKycUploadSize(raw.size);
  if (sizeError) {
    throw new Error(sizeError);
  }
  const buffer = Buffer.from(await raw.arrayBuffer());
  return { buffer, mime: raw.type || 'image/jpeg' };
}

export async function submitKycAction(
  _prev: KycActionState,
  formData: FormData,
): Promise<KycActionState> {
  const session = await getCustomerSession();
  if (!session) {
    return { status: 'error', message: 'Sign in to submit KYC.' };
  }

  await requireCompleteProfile(session.customerId);

  const bookingCode = String(formData.get('bookingCode') ?? '').trim();
  let bookingId: string | null = null;
  if (bookingCode) {
    try {
      const owned = await requireCustomerOwnsBookingCode(session, bookingCode);
      bookingId = owned.bookingId;
    } catch {
      return { status: 'error', message: 'Invalid booking reference.' };
    }
  }

  try {
    const aadhaarFront = await fileFromForm(formData, 'aadhaarFront');
    const aadhaarBack = await fileFromForm(formData, 'aadhaarBack');
    const selfie = await fileFromForm(formData, 'selfie');

    if (!aadhaarFront || !aadhaarBack || !selfie) {
      return {
        status: 'error',
        message: 'Upload Aadhaar front, Aadhaar back, and a selfie.',
      };
    }

    const result = await submitKyc({
      customerId: session.customerId,
      bookingId,
      aadhaarFront,
      aadhaarBack,
      selfie,
    });

    if (!result.ok) {
      return { status: 'error', message: result.message };
    }

    revalidatePath('/account/profile');
    revalidatePath('/admin/kyc');
    if (bookingCode) {
      revalidatePath(`/booking/${bookingCode}`);
      redirect(`/booking/${bookingCode}`);
    }
    redirect('/account/profile?section=identity&submitted=1');
  } catch (err) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : String(err);
    if (/body exceeded.*limit/i.test(message)) {
      return { status: 'error', message: KYC_FILE_TOO_LARGE_MESSAGE };
    }
    return { status: 'error', message: kycCustomerErrorMessage(err) };
  }
}
