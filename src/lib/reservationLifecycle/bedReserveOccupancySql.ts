/**
 * SSOT SQL for bed_reserve_holds that block inventory and show as reserved (purple).
 * Used by admin map, public PG pages, and occupancy batch queries.
 */

/** Raw SQL predicate on alias `brh` — inventory-blocking reserve hold statuses. */
export const BED_RESERVE_HOLD_INVENTORY_STATUS_SQL = `(
  brh.status::text IN ('under_review', 'active')
  OR (
    brh.status::text = 'pending_payment'
    AND brh.payment_proof_url IS NOT NULL
    AND trim(brh.payment_proof_url) <> ''
  )
)`;

/** Check-in date for the active inventory-blocking hold on a bed (alias `b` or `beds`). */
export function bedReserveHoldCheckInLateralSql(bedIdColumn: string, refDateExpr = 'CURRENT_DATE'): string {
  return `(
    SELECT brh.check_in_date::text
    FROM bed_reserve_holds brh
    WHERE brh.bed_id = ${bedIdColumn}
      AND ${BED_RESERVE_HOLD_INVENTORY_STATUS_SQL}
      AND brh.check_in_date >= ${refDateExpr}::date
    ORDER BY brh.created_at DESC
    LIMIT 1
  )`;
}
