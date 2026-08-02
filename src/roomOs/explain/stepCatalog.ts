/**
 * Derivation step labels — narrative only, no business math.
 */

const STEP_LABELS: Record<string, string> = {
  'occupancy.resolve': 'Bed occupancy resolved from ledger assignment',
  'booking_context.fallback': 'Booking context resolved without active bed assignment',
  'booking_context.ledger_bridge': 'Ledger totals linked to booking context',
  'electricity.meter_baseline': 'Room meter baseline resolved for billing month',
  'electricity.room_status': 'Room electricity status derived from settlement ledger',
  'ledger.financial_summary': 'Booking financial summary projected from ledger rows',
  'ledger.payment_state': 'Payment proof and checkout state evaluated',
  'property_index.assemble': 'Property index assembled from engine snapshots',
  'work_queue.project': 'Work queue projected from property index',
};

export function labelForDerivationStep(stepId: string, engine: string): string {
  return STEP_LABELS[stepId] ?? `${engine}: ${stepId}`;
}
