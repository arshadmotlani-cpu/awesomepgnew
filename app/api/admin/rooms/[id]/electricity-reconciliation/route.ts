import { NextResponse } from 'next/server';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { firstOfMonth } from '@/src/services/billing';
import { getElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';

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

  const ledger = await getElectricitySettlementLedgerView({
    roomId,
    billingMonth: firstOfMonth(month),
    fallbackTotalBillPaise:
      grossBillPaise != null && Number.isFinite(grossBillPaise) ? grossBillPaise : undefined,
  });

  if (!ledger) {
    return NextResponse.json({
      ok: true,
      data: {
        billingMonth: firstOfMonth(month),
        grossBillPaise,
        checkoutCollectedPaise: 0,
        manualCreditsPaise: 0,
        remainingToRecoverPaise: grossBillPaise ?? 0,
        entries: [],
      },
    });
  }

  return NextResponse.json({
    ok: true,
    data: {
      billingMonth: ledger.billingMonth,
      grossBillPaise: ledger.totalRoomBillPaise,
      checkoutCollectedPaise: ledger.checkoutSettlementTotalPaise,
      manualCreditsPaise: ledger.manualCreditsTotalPaise,
      remainingToRecoverPaise: ledger.remainingRoomBalancePaise,
      entries: ledger.checkoutSettlementCredits.map((e) => ({
        id: e.id,
        roomId: ledger.roomId,
        customerId: e.customerId,
        customerName: e.customerName,
        bookingId: '',
        checkoutSettlementId: e.id,
        billingMonth: ledger.billingMonth,
        stayPeriodStart: null,
        stayPeriodEnd: null,
        units: null,
        amountPaise: e.amountPaise,
        status: 'collected',
        electricityBillId: ledger.electricityBillId,
        createdAt: e.collectedAt,
      })),
      ledger,
    },
  });
}
