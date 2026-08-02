/**
 * Integrity preflight rule catalog v1 — ADR-OR-001 blocking table.
 */

import type { PreflightScenario } from '@/src/roomOs/integrity/types';

export type IntegrityRuleDefinition = {
  reasonCode: string;
  severity: 'block' | 'warn';
  duplicateKind?:
    | 'rent_invoice'
    | 'electricity_invoice'
    | 'primary_reservation'
    | 'residency_open'
    | 'checkout_settlement';
  invariantKind?:
    | 'occupancy'
    | 'deposit'
    | 'booking_status'
    | 'vacating'
    | 'electricity_paid_skip';
  /** Empty = all scenarios */
  scenarios: readonly PreflightScenario[] | 'all';
  description: string;
};

export const INTEGRITY_PREFLIGHT_RULES_V1: readonly IntegrityRuleDefinition[] = [
  {
    reasonCode: 'DUP_RENT_INVOICE_ACTIVE',
    severity: 'block',
    duplicateKind: 'rent_invoice',
    scenarios: [
      'RENT_ONLY_ONBOARDING',
      'REGENERATE_ELECTRICITY',
      'REACTIVATE_BOOKING',
      'ROOM_TRANSFER',
    ],
    description: 'Multiple non-cancelled rent invoices for the same booking and billing month.',
  },
  {
    reasonCode: 'DUP_ELEC_INVOICE_ACTIVE',
    severity: 'block',
    duplicateKind: 'electricity_invoice',
    scenarios: ['REGENERATE_ELECTRICITY'],
    description: 'Multiple non-cancelled electricity invoices for the same resident, room, and month.',
  },
  {
    reasonCode: 'DUP_PRIMARY_RESERVATION',
    severity: 'block',
    duplicateKind: 'primary_reservation',
    scenarios: 'all',
    description: 'More than one active primary reservation for the same booking.',
  },
  {
    reasonCode: 'DUP_RESIDENCY_OPEN',
    severity: 'warn',
    duplicateKind: 'residency_open',
    scenarios: ['REACTIVATE_BOOKING', 'RENT_ONLY_ONBOARDING'],
    description: 'Customer already has an open residency lifecycle.',
  },
  {
    reasonCode: 'DUP_CHECKOUT_SETTLEMENT_OPEN',
    severity: 'warn',
    duplicateKind: 'checkout_settlement',
    scenarios: [
      'ROLLBACK_VACATING',
      'REACTIVATE_BOOKING',
      'REPAIR_OCCUPANCY',
      'ROOM_TRANSFER',
    ],
    description: 'Multiple open checkout settlements for the same booking.',
  },
  {
    reasonCode: 'INV_DEPOSIT_NOT_FULLY_HELD',
    severity: 'block',
    invariantKind: 'deposit',
    scenarios: ['RENT_ONLY_ONBOARDING'],
    description: 'Deposit constraint requires full hold but outstanding deposit remains.',
  },
  {
    reasonCode: 'INV_ELEC_PAID_REGEN_RISK',
    severity: 'block',
    invariantKind: 'electricity_paid_skip',
    scenarios: ['REGENERATE_ELECTRICITY'],
    description: 'Regenerating electricity would affect an invoice with payment already recorded.',
  },
  {
    reasonCode: 'INV_BOOKING_PG_MISMATCH',
    severity: 'block',
    invariantKind: 'booking_status',
    scenarios: 'all',
    description: 'Booking does not belong to the scoped property.',
  },
  {
    reasonCode: 'INV_BED_DOUBLE_OCCUPIED',
    severity: 'block',
    invariantKind: 'occupancy',
    scenarios: ['ROOM_TRANSFER', 'REACTIVATE_BOOKING'],
    description: 'Target bed has a conflicting active booking.',
  },
] as const;

export function ruleAppliesToScenario(
  rule: IntegrityRuleDefinition,
  scenario: PreflightScenario,
): boolean {
  return rule.scenarios === 'all' || rule.scenarios.includes(scenario);
}
