export type PackageRetailItem = {
  retailUnitPaise: number;
  quantity: number;
};

export type PackageAllocationItem = {
  serviceId: string;
  quantity: number;
  retailUnitPaise: number;
};

export type PackageAllocatedUnit = {
  serviceId: string;
  quantity: number;
  allocatedTotalPaise: number;
  effectiveUnitPaise: number;
};

export type PackageDiscount = {
  discountAmountPaise: number;
  discountBps: number;
  discountPercentDisplay: number;
};

export function computePackageNormalValuePaise(items: PackageRetailItem[]): number {
  let total = 0;
  for (const item of items) {
    const qty = Math.max(0, Math.floor(Number(item.quantity) || 0));
    const unit = Math.max(0, Math.floor(Number(item.retailUnitPaise) || 0));
    total += unit * qty;
  }
  return total;
}

export function computePackageDiscount(
  normalValuePaise: number,
  offerPricePaise: number,
): PackageDiscount {
  const normal = Math.max(0, Math.floor(Number(normalValuePaise) || 0));
  const offer = Math.max(0, Math.floor(Number(offerPricePaise) || 0));
  const discountAmountPaise = Math.max(0, normal - offer);
  const discountBps = normal > 0 ? Math.round((discountAmountPaise * 10000) / normal) : 0;
  return {
    discountAmountPaise,
    discountBps,
    discountPercentDisplay: discountBps / 100,
  };
}

export function allocateEffectiveUnitValues(
  items: PackageAllocationItem[],
  offerPricePaise: number,
): PackageAllocatedUnit[] {
  if (items.length === 0) return [];
  const offer = Math.max(0, Math.floor(Number(offerPricePaise) || 0));
  const normalized = items.map((item) => ({
    serviceId: item.serviceId,
    quantity: Math.max(0, Math.floor(Number(item.quantity) || 0)),
    retailUnitPaise: Math.max(0, Math.floor(Number(item.retailUnitPaise) || 0)),
  }));

  const weights = normalized.map((item) => item.retailUnitPaise * item.quantity);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  let allocated: number[];
  if (totalWeight <= 0) {
    const n = normalized.length;
    const base = Math.floor(offer / n);
    let rem = offer - base * n;
    allocated = normalized.map(() => {
      const extra = rem > 0 ? 1 : 0;
      if (rem > 0) rem -= 1;
      return base + extra;
    });
  } else {
    const exact = weights.map((w) => (offer * w) / totalWeight);
    const floors = exact.map((e) => Math.floor(e));
    let remainder = offer - floors.reduce((sum, v) => sum + v, 0);
    const order = exact
      .map((e, i) => ({ i, frac: e - floors[i]! }))
      .sort((a, b) => b.frac - a.frac || a.i - b.i);
    allocated = [...floors];
    for (let k = 0; k < remainder; k++) {
      const idx = order[k]!.i;
      allocated[idx]! += 1;
    }
  }

  return normalized.map((item, i) => {
    const allocatedTotalPaise = allocated[i]!;
    const effectiveUnitPaise =
      item.quantity > 0 ? Math.floor(allocatedTotalPaise / item.quantity) : 0;
    return {
      serviceId: item.serviceId,
      quantity: item.quantity,
      allocatedTotalPaise,
      effectiveUnitPaise,
    };
  });
}
