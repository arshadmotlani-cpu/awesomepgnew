import { NextResponse } from 'next/server';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { getReferralSummaryForCustomer } from '@/src/services/referrals';

export async function GET() {
  const session = await requireCustomerSession('/account/profile');
  const summary = await getReferralSummaryForCustomer(session.customerId);
  return NextResponse.json(summary);
}
