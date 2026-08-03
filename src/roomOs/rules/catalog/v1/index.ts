/**
 * Rules catalog v1 — bootstrap seed for DB-published rules (Wave 5).
 * Code catalog remains fallback when no DB rows exist.
 */

export type RuleScope = 'global' | 'property' | 'floor' | 'room' | 'bed' | 'booking';

export type RuleOverrideMode = 'replace' | 'merge';

export type RuleDefinition = {
  id: string;
  scope: RuleScope;
  overrideMode: RuleOverrideMode;
  description: string;
  /** Fact key this rule evaluates against (e.g. electricity.status). */
  factKey: string;
  /** Deterministic outcome when matched. */
  outcome: Record<string, unknown>;
};

/** Scope precedence: most specific wins when overrideMode is replace. */
export const RULE_SCOPE_PRECEDENCE: Record<RuleScope, number> = {
  global: 0,
  property: 1,
  floor: 2,
  room: 3,
  bed: 4,
  booking: 5,
};

export const RULES_CATALOG_V1: readonly RuleDefinition[] = [
  {
    id: 'global.electricity.require_meter_before_bill',
    scope: 'global',
    overrideMode: 'replace',
    description: 'Electricity bill generation requires a current meter reading.',
    factKey: 'electricity.meterReadingState',
    outcome: { required: 'current', blockReason: 'missing_meter' },
  },
  {
    id: 'global.work_queue.proofs_first',
    scope: 'global',
    overrideMode: 'replace',
    description: 'Payment proofs bucket precedes overdue rent in work queue.',
    factKey: 'work_queue.bucket_order',
    outcome: { order: ['proofs', 'overdue_rent', 'rent_today', 'electricity', 'move_out', 'day_close'] },
  },
  {
    id: 'property.billing_month_anchor',
    scope: 'property',
    overrideMode: 'merge',
    description: 'Property billing month anchor for index materialization.',
    factKey: 'billing.month_anchor',
    outcome: { anchorDay: 1 },
  },
  {
    id: 'room.electricity.occupant_mode',
    scope: 'room',
    overrideMode: 'replace',
    description: 'Room electricity occupant resolution mode.',
    factKey: 'electricity.occupant_mode',
    outcome: { mode: 'month' },
  },
  {
    id: 'bed.occupancy.active_only',
    scope: 'bed',
    overrideMode: 'replace',
    description: 'Bed Brain binds only active or vacating bookings.',
    factKey: 'occupancy.residency_status',
    outcome: { allowed: ['active', 'vacating'] },
  },
  {
    id: 'booking.deposit.before_move_out',
    scope: 'booking',
    overrideMode: 'merge',
    description: 'Deposit settlement must complete before move-out queue item clears.',
    factKey: 'move_out.deposit_gate',
    outcome: { requireDepositSettled: true },
  },
] as const;

export const RULES_CATALOG_V1_ID = 'rules-catalog-v1';
