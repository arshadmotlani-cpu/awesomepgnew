import { NextResponse } from 'next/server';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { firstOfMonth } from '@/src/services/billing';
import { getRoomCheckoutElectricityReconciliation } from '@/src/services/electricitySettlementLedger';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await requireAdminPermission('electricity:write');
  const { id: roomId } = await context.params;
  const url = new URL(request.url);
  const month = url.searchParams.get('month');
  const grossBillPaiseRaw = url.searchParams.get('grossBillPaise');
  const grossBillPaise =
    grossBillPaiseRaw != null && grossBillPaiseRaw !== ''
      ? Number(grossBillPaiseRaw)
      : null;

  if (!month) {
    return NextResponse.json({ ok: false, error: 'month is required' }, { status: 400 });
  }

  const reconciliation = await getRoomCheckoutElectricityReconciliation(
    roomId,
    firstOfMonth(month),
    grossBillPaise != null && Number.isFinite(grossBillPaise) ? grossBillPaise : null,
  );

  return NextResponse.json({ ok: true, data: reconciliation });
}
