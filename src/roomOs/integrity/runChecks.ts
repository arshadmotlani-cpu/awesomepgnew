/**
 * Orchestrates read-only integrity checks for a validated scope.
 */

import { ruleAppliesToScenario } from '@/src/roomOs/integrity/catalog/v1';
import { INTEGRITY_PREFLIGHT_RULES_V1 } from '@/src/roomOs/integrity/catalog/v1/rules';
import { checkDuplicateCheckoutSettlements } from '@/src/roomOs/integrity/checks/duplicates/checkoutSettlements';
import { checkDuplicateElectricityInvoices } from '@/src/roomOs/integrity/checks/duplicates/electricityInvoices';
import { checkOpenResidencyDuplicates } from '@/src/roomOs/integrity/checks/duplicates/openResidency';
import { checkDuplicatePrimaryReservations } from '@/src/roomOs/integrity/checks/duplicates/primaryReservations';
import { checkDuplicateRentInvoices } from '@/src/roomOs/integrity/checks/duplicates/rentInvoices';
import { checkBedDoubleOccupied } from '@/src/roomOs/integrity/checks/invariants/bedDoubleOccupied';
import { checkBookingPgMismatch } from '@/src/roomOs/integrity/checks/invariants/bookingPgMismatch';
import { checkDepositFullyHeld } from '@/src/roomOs/integrity/checks/invariants/depositHeld';
import { checkElectricityPaidRegenRisk } from '@/src/roomOs/integrity/checks/invariants/elecPaidRegenRisk';
import type {
  DuplicateFinding,
  InvariantFinding,
  PreflightCheckContext,
  PreflightScope,
} from '@/src/roomOs/integrity/types';

export type PreflightCheckResults = {
  duplicates: DuplicateFinding[];
  invariants: InvariantFinding[];
};

function isRuleEnabled(reasonCode: string, scenario: PreflightScope['scenario']): boolean {
  const rule = INTEGRITY_PREFLIGHT_RULES_V1.find((r) => r.reasonCode === reasonCode);
  if (!rule) return false;
  return ruleAppliesToScenario(rule, scenario);
}

export async function runPreflightChecks(scope: PreflightScope): Promise<PreflightCheckResults> {
  const ctx: PreflightCheckContext = { scope, scenario: scope.scenario };
  const duplicates: DuplicateFinding[] = [];
  const invariants: InvariantFinding[] = [];

  if (isRuleEnabled('INV_BOOKING_PG_MISMATCH', scope.scenario)) {
    invariants.push(...(await checkBookingPgMismatch(ctx)));
  }

  if (isRuleEnabled('DUP_RENT_INVOICE_ACTIVE', scope.scenario)) {
    duplicates.push(...(await checkDuplicateRentInvoices(ctx)));
  }

  if (isRuleEnabled('DUP_ELEC_INVOICE_ACTIVE', scope.scenario)) {
    duplicates.push(...(await checkDuplicateElectricityInvoices(ctx)));
  }

  if (isRuleEnabled('DUP_PRIMARY_RESERVATION', scope.scenario)) {
    duplicates.push(...(await checkDuplicatePrimaryReservations(ctx)));
  }

  if (isRuleEnabled('DUP_CHECKOUT_SETTLEMENT_OPEN', scope.scenario)) {
    duplicates.push(...(await checkDuplicateCheckoutSettlements(ctx)));
  }

  if (isRuleEnabled('DUP_RESIDENCY_OPEN', scope.scenario)) {
    duplicates.push(...(await checkOpenResidencyDuplicates(ctx)));
  }

  if (isRuleEnabled('INV_DEPOSIT_NOT_FULLY_HELD', scope.scenario)) {
    invariants.push(...(await checkDepositFullyHeld(ctx)));
  }

  if (isRuleEnabled('INV_ELEC_PAID_REGEN_RISK', scope.scenario)) {
    invariants.push(...(await checkElectricityPaidRegenRisk(ctx)));
  }

  if (isRuleEnabled('INV_BED_DOUBLE_OCCUPIED', scope.scenario)) {
    invariants.push(...(await checkBedDoubleOccupied(ctx)));
  }

  return { duplicates, invariants };
}
