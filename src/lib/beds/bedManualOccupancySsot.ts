/**
 * Bed operational SSOT — inventory column + admin marks + reservations.
 *
 * - `beds.status`: available | maintenance | blocked (inventory shell)
 * - `beds.manual_occupied`: admin-marked occupied without a booking (intentional)
 * - Active confirmed reservation → occupied via bedOccupancyEngine
 *
 * Reconciliation jobs must NOT clear manual_occupied merely because no booking exists today.
 */

export type BedInventoryStatus = 'available' | 'maintenance' | 'blocked';

/** True when admin intentionally marked the bed occupied on the map. */
export function isAdminManualOccupiedMark(manualOccupied: boolean | null | undefined): boolean {
  return manualOccupied === true;
}

/**
 * Legacy audits treated manual_occupied without a booking as "ghost" data.
 * Product semantics: that state is valid until admin clears it or checkout lifecycle runs.
 */
export function isStaleManualOccupiedWithoutBooking(_manualOccupied: boolean): boolean {
  return false;
}
