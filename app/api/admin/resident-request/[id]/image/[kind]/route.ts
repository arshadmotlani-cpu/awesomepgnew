import { NextResponse } from 'next/server';
import { proofUrlToImageResponse } from '@/src/lib/payments/proofResponse';
import { getAdminSession } from '@/src/lib/auth/session';
import type { ResidentRequestImageKind } from '@/src/lib/residents/residentRequestImages';
import { resolveAdminResidentRequestImageUrl } from '@/src/services/residentRequests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS = new Set<ResidentRequestImageKind>(['meter', 'refund_qr']);

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; kind: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin sign-in required.' }, { status: 401 });
  }

  const { id, kind } = await ctx.params;
  if (!KINDS.has(kind as ResidentRequestImageKind)) {
    return new Response('Unknown image type', { status: 404 });
  }

  const storedUrl = await resolveAdminResidentRequestImageUrl(
    session,
    id,
    kind as ResidentRequestImageKind,
  );
  if (!storedUrl) {
    return new Response('Image not found', { status: 404 });
  }

  return proofUrlToImageResponse(storedUrl);
}
