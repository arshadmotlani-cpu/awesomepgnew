import type { ExpressBookingStayType } from '@/src/services/expressBookingQuote';

export function validateExpressBookingDepositTerms(input: {
  stayType: ExpressBookingStayType;
  quoteDepositPaise: number;
  depositRequiredPaise: number;
  depositPaidPaise: number;
  allowCustomDeposit: boolean;
}): { ok: true } | { ok: false; error: string } {
  if (input.stayType === 'fixed') {
    if (input.depositRequiredPaise > 0 || input.depositPaidPaise > 0) {
      return { ok: false, error: 'Fixed stays do not include deposit.' };
    }
    return { ok: true };
  }

  if (input.depositRequiredPaise < 0 || input.depositPaidPaise < 0) {
    return { ok: false, error: 'Deposit amounts cannot be negative.' };
  }

  if (!input.allowCustomDeposit) {
    const tolerance = 100;
    if (Math.abs(input.quoteDepositPaise - input.depositRequiredPaise) > tolerance) {
      return {
        ok: false,
        error: `Deposit mismatch — expected ₹${(input.quoteDepositPaise / 100).toLocaleString('en-IN')}.`,
      };
    }
  }

  if (input.depositPaidPaise > input.depositRequiredPaise + 100) {
    return {
      ok: false,
      error: 'Deposit collected cannot exceed the security deposit obligation.',
    };
  }

  return { ok: true };
}
