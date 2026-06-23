import { NextResponse } from 'next/server';
import { getPublicBookingQuote } from '@/src/lib/booking/publicQuote';
import { pricingModeFromStayType, type StayType } from '@/src/lib/stayType';
import type { PricingMode } from '@/src/services/pricing';

const VALID_MODES: ReadonlySet<PricingMode> = new Set([
  'open_ended',
  'fixed_stay',
  'monthly',
  'daily',
  'weekly',
]);

type Body = {
  bedIds?: string[];
  startDate?: string;
  endDate?: string | null;
  durationMode?: PricingMode;
  stayType?: StayType;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const bedIds = Array.isArray(body.bedIds)
    ? body.bedIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const startDate = typeof body.startDate === 'string' ? body.startDate.trim() : '';
  const endDate =
    body.endDate === null || body.endDate === undefined
      ? null
      : typeof body.endDate === 'string'
        ? body.endDate.trim()
        : null;

  let durationMode = body.durationMode;
  if (body.stayType === 'monthly_stay' || body.stayType === 'fixed_date_stay') {
    durationMode = pricingModeFromStayType(body.stayType);
  }

  if (!durationMode || !VALID_MODES.has(durationMode)) {
    return NextResponse.json({ ok: false, error: 'Invalid duration mode.' }, { status: 400 });
  }
  if (bedIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'At least one bed is required.' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return NextResponse.json({ ok: false, error: 'Invalid start date.' }, { status: 400 });
  }
  if (endDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json({ ok: false, error: 'Invalid end date.' }, { status: 400 });
  }

  try {
    const quote = await getPublicBookingQuote({
      bedIds,
      startDate,
      endDate: durationMode === 'open_ended' ? null : endDate,
      durationMode,
    });
    return NextResponse.json({
      ok: true,
      quote: {
        startDate: quote.startDate,
        endDate: quote.endDate,
        durationMode: quote.durationMode,
        subtotalPaise: quote.subtotalPaise,
        depositPaise: quote.depositPaise,
        totalPaise: quote.totalPaise,
        perBed: quote.perBed.map((b) => ({
          bedId: b.bedId,
          subtotalPaise: b.subtotalPaise,
          depositPaise: b.depositPaise,
          lineItems: b.lineItems,
          nights: b.nights,
        })),
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not compute quote.',
      },
      { status: 400 },
    );
  }
}
