import { NextRequest, NextResponse } from 'next/server';
import { editDepositSummaryCore } from '@/app/(admin)/admin/deposits/deposit-wallet-actions';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await context.params;
  const formData = await req.formData();
  const postedBookingId = String(formData.get('bookingId') ?? '');
  if (postedBookingId && postedBookingId !== bookingId) {
    return NextResponse.redirect(
      new URL(
        `/admin/deposits/${bookingId}?depositError=${encodeURIComponent('Booking mismatch.')}`,
        req.url,
      ),
      303,
    );
  }

  const result = await editDepositSummaryCore(formData);
  if (result.status === 'error') {
    return NextResponse.redirect(
      new URL(
        `/admin/deposits/${bookingId}?depositError=${encodeURIComponent(result.message)}`,
        req.url,
      ),
      303,
    );
  }

  return NextResponse.redirect(new URL(`/admin/deposits/${bookingId}?saved=1`, req.url), 303);
}
