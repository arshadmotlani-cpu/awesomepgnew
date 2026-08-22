import { buildAttributionPlan } from '@/src/hair/domain/basket/attribution';
import {
  computeInclusiveGrandTotal,
  priceLineFromParts,
} from '@/src/hair/domain/basket/gstInclusiveMath';
import type { Basket, PricedBasket, PricedLine } from '@/src/hair/domain/basket/types';
import { planCheckoutLedger } from '@/src/hair/domain/ledger/plan';

function refIds(type: PricedLine['billableRef']['type'], id: string) {
  return {
    serviceId: type === 'service' ? id : null,
    productId: type === 'product' ? id : null,
    packageId: type === 'package' ? id : null,
    membershipId: type === 'membership' ? id : null,
  };
}

export function priceBasket(basket: Basket): PricedBasket {
  const lines: PricedLine[] = basket.lines.map((line) => {
    const priced = priceLineFromParts({
      unitSellingPricePaise: line.snapshot.unitSellingPricePaise,
      quantity: line.quantity,
      gstBps: line.snapshot.gstBps,
      overridePricePaise: line.overridePricePaise,
    });
    const ids = refIds(line.billableRef.type, line.billableRef.id);
    const primaryStaffId = line.staff[0]?.staffId ?? null;
    return {
      lineId: line.lineId,
      billableRef: line.billableRef,
      snapshot: line.snapshot,
      quantity: line.quantity,
      staff: line.staff,
      ...priced,
      ...ids,
      primaryStaffId,
    };
  });

  const subtotalBasePaise = lines.reduce((s, l) => s + l.basePaise, 0);
  const taxPaise = lines.reduce((s, l) => s + l.gstPaise, 0);
  const lineDiscountPaise = lines.reduce((s, l) => s + l.discountPaise, 0);
  const membershipDiscountPaise = Math.max(0, basket.membershipDiscountPaise ?? 0);
  const packageRedemptionPaise = Math.max(0, basket.packageRedemptionPaise ?? 0);
  const inclusiveFinalPaise = lines.reduce((s, l) => s + l.finalLinePaise, 0);
  const grandTotalPaise = computeInclusiveGrandTotal({
    inclusiveFinalPaise,
    membershipDiscountPaise,
    packageRedeemPaise: packageRedemptionPaise,
  });

  const attributions = buildAttributionPlan(lines);
  const ledgerPlan = planCheckoutLedger({
    customerId: basket.customerId,
    grandTotalPaise,
    payments: basket.payments,
    flags: basket.flags,
  });

  return {
    customerId: basket.customerId,
    lines,
    totals: {
      subtotalBasePaise,
      taxPaise,
      lineDiscountPaise,
      membershipDiscountPaise,
      packageRedemptionPaise,
      grandTotalPaise,
    },
    attributions,
    ledgerPlan,
    flags: basket.flags,
  };
}
