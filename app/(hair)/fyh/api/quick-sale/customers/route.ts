import { NextResponse } from 'next/server';
import { getHairAuthOptional } from '@/src/hair/lib/auth/guards';
import { searchCustomersForPos } from '@/src/hair/services/quickSale';

export async function GET(request: Request) {
  const admin = await getHairAuthOptional();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? '';
  const hits = await searchCustomersForPos(q);
  return NextResponse.json(hits);
}
