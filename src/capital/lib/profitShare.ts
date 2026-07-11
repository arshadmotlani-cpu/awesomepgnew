import { computeVehicleRois } from '@/src/capital/lib/roi';

export type ProfitShareMode = 'percentage' | 'fixed';

export type ProfitShareInput = {
  grossPaise: number;
  mode: ProfitShareMode;
  /** Partner percentage 0–100 when mode=percentage */
  partnerPct?: number;
  /** My percentage 0–100 when mode=percentage */
  myPct?: number;
  /** Partner fixed amount in paise when mode=fixed */
  partnerFixedPaise?: number;
  /** My fixed amount in paise when mode=fixed (optional — remainder if omitted) */
  myFixedPaise?: number;
};

export type ProfitShareResult = {
  mode: ProfitShareMode;
  grossPaise: number;
  partnerSharePaise: number;
  mySharePaise: number;
  partnerSharePctBps: number;
  mySharePctBps: number;
  businessRoiBps: number | null;
  myRoiBps: number | null;
};

/**
 * Compute partner vs investor (me) split from gross profit.
 * Percentage mode: partnerPct + myPct must equal 100.
 * Fixed mode: partner fixed amount; my share = remainder (or explicit myFixed).
 */
export function computeProfitShare(
  input: ProfitShareInput,
  investmentPaise?: number,
): ProfitShareResult {
  const gross = Math.round(input.grossPaise);
  if (!Number.isFinite(gross)) throw new Error('Invalid gross profit');

  let partnerSharePaise: number;
  let mySharePaise: number;
  let partnerSharePctBps: number;
  let mySharePctBps: number;

  if (input.mode === 'percentage') {
    const partnerPct = Number(input.partnerPct ?? 0);
    const myPct = Number(input.myPct ?? 100 - partnerPct);
    if (partnerPct < 0 || myPct < 0) throw new Error('Share percentages cannot be negative');
    if (Math.round(partnerPct + myPct) !== 100) {
      throw new Error('Partner % and My % must add up to 100');
    }
    partnerSharePctBps = Math.round(partnerPct * 100);
    mySharePctBps = Math.round(myPct * 100);
    partnerSharePaise = Math.round((gross * partnerSharePctBps) / 10000);
    mySharePaise = gross - partnerSharePaise;
  } else {
    const partnerFixed = Math.round(input.partnerFixedPaise ?? 0);
    if (partnerFixed < 0) throw new Error('Partner share cannot be negative');
    if (partnerFixed > Math.abs(gross) && gross >= 0) {
      throw new Error('Partner share cannot exceed gross profit');
    }
    if (input.myFixedPaise != null) {
      mySharePaise = Math.round(input.myFixedPaise);
      partnerSharePaise = partnerFixed;
      if (partnerSharePaise + mySharePaise !== gross) {
        throw new Error('Partner share + My share must equal gross profit');
      }
    } else {
      partnerSharePaise = partnerFixed;
      mySharePaise = gross - partnerSharePaise;
    }
    if (gross === 0) {
      partnerSharePctBps = 0;
      mySharePctBps = 10000;
    } else {
      partnerSharePctBps = Math.round((partnerSharePaise * 10000) / gross);
      mySharePctBps = 10000 - partnerSharePctBps;
    }
  }

  const { businessRoiBps, myRoiBps } = computeVehicleRois(
    gross,
    mySharePaise,
    partnerSharePaise,
    investmentPaise ?? 0,
  );

  return {
    mode: input.mode,
    grossPaise: gross,
    partnerSharePaise,
    mySharePaise,
    partnerSharePctBps,
    mySharePctBps,
    businessRoiBps: investmentPaise != null && investmentPaise > 0 ? businessRoiBps : null,
    myRoiBps: investmentPaise != null && investmentPaise > 0 ? myRoiBps : null,
  };
}

/** Default: 100% to investor (no partner cut) — used for backfill / unspecified. */
export function fullInvestorShare(grossPaise: number, investmentPaise?: number): ProfitShareResult {
  return computeProfitShare(
    { grossPaise, mode: 'percentage', partnerPct: 0, myPct: 100 },
    investmentPaise,
  );
}
