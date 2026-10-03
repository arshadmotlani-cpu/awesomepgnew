import { NextResponse } from 'next/server';
import { proofUrlToImageResponse } from '@/src/lib/payments/proofResponse';
import { getAdminSession } from '@/src/lib/auth/session';
import { getMeterLogImageForAdminSession } from '@/src/services/meterLogAdminImages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin sign-in required.' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const row = await getMeterLogImageForAdminSession(session, id);
  if (!row) {
    return new Response('Meter log not found', { status: 404 });
  }
  if (!row.meterImageUrl?.trim()) {
    return new Response('Image not uploaded', { status: 404 });
  }

  return proofUrlToImageResponse(row.meterImageUrl);
}
