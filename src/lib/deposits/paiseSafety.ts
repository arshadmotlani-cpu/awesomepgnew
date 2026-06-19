/**
 * Deposit paise coercion — strip PostgreSQL bigint before RSC/client boundaries.
 */

import { asPlainNumber, coerceNonNegativePaise } from '@/src/lib/format';

/** Coerce paise; log if driver returned bigint (production Neon/postgres.js). */
export function guardDepositPaise(value: unknown, fieldName: string): number {
  if (typeof value === 'bigint') {
    console.error('[BIGINT_LEAK]', fieldName, value);
    return Number(value);
  }
  return coerceNonNegativePaise(value);
}

export function guardPlainPaise(value: unknown, fieldName: string): number {
  if (typeof value === 'bigint') {
    console.error('[BIGINT_LEAK]', fieldName, value);
    return Number(value);
  }
  return asPlainNumber(value);
}
