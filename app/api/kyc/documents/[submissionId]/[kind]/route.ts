import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { kycSubmissions } from '@/src/db/schema';
import { getAdminSession, getCustomerSession } from '@/src/lib/auth/session';
import { resolveKycDocumentResponse } from '@/src/lib/kyc/storage';

const KIND_TO_FIELD = {
  aadhaar_front: 'aadhaarFrontPath',
  aadhaar_back: 'aadhaarBackPath',
  selfie: 'selfiePath',
} as const;

const KIND_TO_MIME = {
  aadhaar_front: 'aadhaarFrontMime',
  aadhaar_back: 'aadhaarBackMime',
  selfie: 'selfieMime',
} as const;

type Kind = keyof typeof KIND_TO_FIELD;

export async function GET(
  _request: Request,
  context: { params: Promise<{ submissionId: string; kind: string }> },
) {
  const { submissionId, kind: kindRaw } = await context.params;
  if (!(kindRaw in KIND_TO_FIELD)) {
    return Response.json({ error: 'Invalid document kind.' }, { status: 400 });
  }
  const kind = kindRaw as Kind;

  const [sub] = await db
    .select()
    .from(kycSubmissions)
    .where(eq(kycSubmissions.id, submissionId))
    .limit(1);
  if (!sub) {
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }

  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();
  const isOwner = customerSession?.customerId === sub.customerId;
  const isAdmin = Boolean(adminSession);
  if (!isOwner && !isAdmin) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const storedPath = sub[KIND_TO_FIELD[kind]];
  const mimeHint = sub[KIND_TO_MIME[kind]];

  try {
    return await resolveKycDocumentResponse(storedPath, mimeHint);
  } catch {
    return Response.json({ error: 'File missing.' }, { status: 404 });
  }
}
