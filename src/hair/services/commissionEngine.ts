/**
 * Future commission rules engine — billing must not evaluate rules inline.
 * Dual-write: legacy service commission still runs in applyLegacyServiceCommission until this is enabled.
 */
export async function computeCommissionForPaidInvoice(_invoiceId: string): Promise<void> {
  // Feature-flag / phase-2: read fyh_invoice_line_attributions + fyh_commission_rules → fyh_commission_entries
  return;
}
