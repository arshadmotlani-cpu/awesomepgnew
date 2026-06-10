import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { kycSubmissions } from '@/src/db/schema';
import { getAdminSession, getCustomerSession } from '@/src/lib/auth/session';
import { resolveKycFilePath } from '@/src/lib/kyc/storage';

const KIND_TO_FIELD = {
  aadhaar_front: 'aadhaarFrontPath',
  aadhaar_back: 'aadhaarBackPath',
  selfie: 'selfiePath',
} as const;

type Kind = keyof typeof KIND_TO_FIELD;

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ submissionId: string; kind: string }> },
) {
  const { submissionId, kind: kindRaw } = await context.params;
  if (!(kindRaw in KIND_TO_FIELD)) {
    return NextResponse.json({ error: 'Invalid document kind.' }, { status: 400 });
  }
  const kind = kindRaw as Kind;

  const [sub] = await db
    .select()
    .from(kycSubmissions)
    .where(eq(kycSubmissions.id, submissionId))
    .limit(1);
  if (!sub) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();
  const isOwner = customerSession?.customerId === sub.customerId;
  const isAdmin = Boolean(adminSession);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const relativePath = sub[KIND_TO_FIELD[kind]];
  let absolutePath: string;
  try {
    absolutePath = resolveKycFilePath(relativePath);
  } catch {
    return NextResponse.json({ error: 'Invalid path.' }, { status: 400 });
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(absolutePath);
  } catch {
    return NextResponse.json({ error: 'File missing.' }, { status: 404 });
  }

  const ext = path.extname(absolutePath).slice(1).toLowerCase();
  const contentType = MIME[ext] ?? 'application/octet-stream';

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, no-store',
    },
  });
}
