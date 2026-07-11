import { NextResponse } from 'next/server';
import { searchAssets } from '@/src/capital/services/search';
import { requireCapitalApiAuth } from '@/src/capital/lib/api/guard';

export async function GET(request: Request) {
  const auth = await requireCapitalApiAuth();
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? '';
  const results = await searchAssets(q, 20);

  return NextResponse.json({
    results: results.map(({ asset, auto }) => ({
      id: asset.id,
      displayName: asset.displayName,
      registrationNumber: auto.registrationNumber,
      status: asset.status,
    })),
  });
}
