import { NextResponse } from 'next/server';
import { getCustomerSession } from '@/src/lib/auth/session';
import { uploadPaymentScreenshot } from '@/src/lib/payments/screenshotUpload';
import type { ResidentUploadType } from '@/src/services/residentUploadEvents';

const UPLOAD_TYPES = new Set<ResidentUploadType>([
  'payment_proof',
  'booking_payment',
  'electricity_payment',
  'extension_payment',
  'deposit_link',
  'ps4_payment',
]);

function parseUploadType(raw: string | null): ResidentUploadType {
  if (raw && UPLOAD_TYPES.has(raw as ResidentUploadType)) {
    return raw as ResidentUploadType;
  }
  return 'payment_proof';
}

/** Customer payment screenshot upload — avoids Server Action RSC refresh after file select. */
export async function POST(req: Request) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Sign in required.' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid upload payload.' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: 'No file provided.' }, { status: 400 });
  }

  const uploadType = parseUploadType(formData.get('uploadType')?.toString() ?? null);
  const bookingId = formData.get('bookingId')?.toString() || null;
  const pgId = formData.get('pgId')?.toString() || null;

  try {
    const url = await uploadPaymentScreenshot(file, {
      customerId: session.customerId,
      uploadType,
      bookingId,
      pgId,
    });
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed.';
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
