import { NextResponse } from 'next/server';
import { getHairAuthOptional } from '@/src/hair/lib/auth/guards';
import { persistEmployeeQrFromFile } from '@/src/workforce/lib/persistEmployeeQr';
import { sanitizeWorkforceEmployeeError } from '@/src/workforce/lib/workforceDbError';

export async function POST(request: Request) {
  const admin = await getHairAuthOptional();
  if (!admin) {
    return NextResponse.json({ error: 'You must be signed in to upload a QR code.' }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const formData = await request.formData();
    const raw = formData.get('file');
    file = raw instanceof File ? raw : null;
  } catch {
    return NextResponse.json({ error: 'Could not read the QR image. Please try again.' }, { status: 400 });
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'Choose a QR image to upload.' }, { status: 400 });
  }

  try {
    const url = await persistEmployeeQrFromFile(file);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: sanitizeWorkforceEmployeeError(err, 'update') }, { status: 400 });
  }
}
