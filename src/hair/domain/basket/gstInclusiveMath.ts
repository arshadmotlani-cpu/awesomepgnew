import { discountBpsFromPaise } from '@/src/hair/lib/attributionMath';

/** Decompose GST-inclusive final amount into base + tax. */
export function decomposeInclusive(finalPaise: number, gstBps: number) {
  const safe = Math.max(0, finalPaise);
  if (gstBps <= 0) {
    return { basePaise: safe, gstPaise: 0 };
  }
  const basePaise = Math.round((safe * 10_000) / (10_000 + gstBps));
  const gstPaise = safe - basePaise;
  return { basePaise, gstPaise };
}

export function priceLineFromParts(opts: {
  unitSellingPricePaise: number;
  quantity: number;
  gstBps: number;
  overridePricePaise: number | null;
}) {
  const catalogGrossPaise = Math.max(0, opts.unitSellingPricePaise * opts.quantity);
  const finalLinePaise = Math.max(
    0,
    opts.overridePricePaise != null ? opts.overridePricePaise : catalogGrossPaise,
  );
  const discountPaise = Math.max(0, catalogGrossPaise - finalLinePaise);
  const discountBps = discountBpsFromPaise(catalogGrossPaise, discountPaise);
  const { basePaise, gstPaise } = decomposeInclusive(finalLinePaise, opts.gstBps);
  return {
    catalogGrossPaise,
    finalLinePaise,
    discountPaise,
    discountBps,
    basePaise,
    gstPaise,
  };
}

export type InclusiveCartLine = {
  unitSellingPricePaise: number;
  quantity: number;
  lineDiscountPaise: number;
  gstBps: number;
};

/** Line discount on a GST-inclusive catalog price → same math as `priceBasket`. */
export function priceInclusiveCartLine(line: InclusiveCartLine) {
  const catalogGrossPaise = Math.max(0, line.unitSellingPricePaise * line.quantity);
  const discountPaise = Math.min(catalogGrossPaise, Math.max(0, line.lineDiscountPaise));
  const overridePricePaise = discountPaise > 0 ? catalogGrossPaise - discountPaise : null;
  return priceLineFromParts({
    unitSellingPricePaise: line.unitSellingPricePaise,
    quantity: line.quantity,
    gstBps: line.gstBps,
    overridePricePaise,
  });
}

export function sumInclusiveCartLines(lines: InclusiveCartLine[]) {
  let subtotalBasePaise = 0;
  let taxPaise = 0;
  let lineDiscountPaise = 0;
  let inclusiveFinalPaise = 0;
  const priced = lines.map((line) => {
    const p = priceInclusiveCartLine(line);
    subtotalBasePaise += p.basePaise;
    taxPaise += p.gstPaise;
    lineDiscountPaise += p.discountPaise;
    inclusiveFinalPaise += p.finalLinePaise;
    return p;
  });
  return { priced, subtotalBasePaise, taxPaise, lineDiscountPaise, inclusiveFinalPaise };
}

/** Charged total: inclusive line finals minus membership/package redemptions. */
export function computeInclusiveGrandTotal(opts: {
  inclusiveFinalPaise: number;
  membershipDiscountPaise?: number;
  packageRedeemPaise?: number;
}) {
  return Math.max(
    0,
    opts.inclusiveFinalPaise -
      Math.max(0, opts.membershipDiscountPaise ?? 0) -
      Math.max(0, opts.packageRedeemPaise ?? 0),
  );
}
