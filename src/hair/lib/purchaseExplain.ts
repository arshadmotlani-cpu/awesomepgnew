export function explainPurchase(purchase: {
  purchase: { purchaseNumber: string; totalPaise: number; purchaseDate: string };
  vendorName: string;
  payable: { balancePaise: number; status: string } | null;
}) {
  const paidPaise = purchase.purchase.totalPaise - (purchase.payable?.balancePaise ?? 0);
  return {
    purchaseNumber: purchase.purchase.purchaseNumber,
    vendorName: purchase.vendorName,
    purchaseDate: purchase.purchase.purchaseDate,
    totalPaise: purchase.purchase.totalPaise,
    paidPaise,
    balancePaise: purchase.payable?.balancePaise ?? 0,
    payableStatus: purchase.payable?.status ?? 'open',
  };
}
