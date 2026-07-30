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
