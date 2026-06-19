/**
 * Deposit paise coercion — strip PostgreSQL bigint before RSC/client boundaries.
 */

import { asPlainNumber, coerceNonNegativePaise } from '@/src/lib/format';

/** Coerce paise to a finite non-negative number for UI and RSC. */
export function guardDepositPaise(value: unknown, _fieldName?: string): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return coerceNonNegativePaise(value);
}

export function guardPlainPaise(value: unknown, _fieldName?: string): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return asPlainNumber(value);
}
