/**
 * Future commission rules engine — billing must not evaluate rules inline.
 * Dual-write: legacy service commission still runs in applyLegacyServiceCommission until this is enabled.
 *
 * Schema (`fyh_commission_rules`, migration 0013 + 0014):
 * - scope: service | product | package | membership | gift_card | retail | course | bridal | global
 * - rule_type: flat_percent | flat_amount | tiered_percent | fixed_bonus | role_based
 * - config: typed JSON (see FyhCommissionRuleConfig in salesAttribution schema)
 * - effective_from / effective_to, priority, staff_role, scope_ref_id
 *
 * Inputs at runtime (future): fyh_invoice_line_attributions + paid invoice context.
 * Outputs (future): fyh_commission_entries (never inline in Quick Sale hot path).
 */
export async function computeCommissionForPaidInvoice(_invoiceId: string): Promise<void> {
  return;
}
