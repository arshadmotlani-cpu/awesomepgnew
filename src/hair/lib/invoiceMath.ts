export function taxOnLine(amountPaise: number, gstBps: number): number {
  return Math.round((Math.max(0, amountPaise) * Math.max(0, gstBps)) / 10_000);
}

export type PricedCartLine = {
  unitPricePaise: number;
  quantity: number;
  lineDiscountPaise: number;
  gstBps: number;
  kind: string;
};

export function sumCartLines(lines: PricedCartLine[]) {
  let subtotalPaise = 0;
  let taxPaise = 0;
  for (const line of lines) {
    const net = Math.max(0, line.unitPricePaise * line.quantity - line.lineDiscountPaise);
    subtotalPaise += net;
    taxPaise += taxOnLine(net, line.gstBps);
  }
  return { subtotalPaise, taxPaise };
}

export function computeGrandTotalFromParts(opts: {
  subtotalPaise: number;
  taxPaise: number;
  discountPaise: number;
  membershipDiscountPaise: number;
  packageRedeemPaise: number;
  walletRedeemPaise: number;
  giftCardRedeemPaise?: number;
  tipPaise?: number;
  roundOffPaise?: number;
}) {
  const giftCardRedeemPaise = opts.giftCardRedeemPaise ?? 0;
  const tipPaise = opts.tipPaise ?? 0;
  const roundOffPaise = opts.roundOffPaise ?? 0;
  const taxableBase = Math.max(
    0,
    opts.subtotalPaise -
      opts.discountPaise -
      opts.membershipDiscountPaise -
      opts.packageRedeemPaise,
  );
  const taxPaiseAdjusted =
    opts.subtotalPaise > 0 ? Math.round((opts.taxPaise * taxableBase) / opts.subtotalPaise) : 0;
  const grandTotalPaise = Math.max(
    0,
    taxableBase +
      taxPaiseAdjusted -
      opts.walletRedeemPaise -
      giftCardRedeemPaise +
      tipPaise +
      roundOffPaise,
  );
  return { taxableBase, taxPaiseAdjusted, grandTotalPaise };
}
