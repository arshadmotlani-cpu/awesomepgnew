import { calcRoiBps } from '@/src/capital/lib/money';
import {
  DEFAULT_INVESTOR_LABELS,
  type InvestorSlot,
  INVESTOR_SLOTS,
} from '@/src/capital/db/schema/investors';

export type InvestorFundingInput = {
  slot: InvestorSlot;
  label?: string;
  investedPaise: number;
};

export type InvestorProfitInput = {
  slot: InvestorSlot;
  profitPaise: number;
};

export type ResolvedInvestor = {
  slot: InvestorSlot;
  label: string;
  investedPaise: number;
  profitPaise: number | null;
  roiBps: number | null;
};

/**
 * Validate Layer 2 funding: sum of investor stakes must equal Net Vehicle Cost
 * (Purchase + Repairs − Refunds/Credits).
 */
export function validateFundingStructure(
  netVehicleCostPaise: number,
  investors: InvestorFundingInput[],
): ResolvedInvestor[] {
  if (netVehicleCostPaise <= 0) throw new Error('Net vehicle cost must be positive');

  const bySlot = new Map<InvestorSlot, InvestorFundingInput>();
  for (const inv of investors) {
    if (!INVESTOR_SLOTS.includes(inv.slot)) throw new Error(`Invalid investor slot: ${inv.slot}`);
    if (inv.investedPaise < 0) throw new Error('Invested amount cannot be negative');
    if (bySlot.has(inv.slot)) throw new Error(`Duplicate investor slot: ${inv.slot}`);
    bySlot.set(inv.slot, inv);
  }

  const resolved: ResolvedInvestor[] = INVESTOR_SLOTS.map((slot) => {
    const row = bySlot.get(slot);
    const investedPaise = Math.round(row?.investedPaise ?? 0);
    return {
      slot,
      label: (row?.label?.trim() || DEFAULT_INVESTOR_LABELS[slot]).slice(0, 80),
      investedPaise,
      profitPaise: null,
      roiBps: null,
    };
  }).filter((r) => r.slot === 'me' || r.investedPaise > 0);

  // Me row is always stored (even if 0) so dashboard "My" mode has a stake row
  if (!resolved.some((r) => r.slot === 'me')) {
    resolved.unshift({
      slot: 'me',
      label: DEFAULT_INVESTOR_LABELS.me,
      investedPaise: 0,
      profitPaise: null,
      roiBps: null,
    });
  }

  const total = resolved.reduce((s, r) => s + r.investedPaise, 0);
  if (total !== netVehicleCostPaise) {
    throw new Error(
      `Investor funding (₹${(total / 100).toLocaleString('en-IN')}) must equal net vehicle cost (₹${(netVehicleCostPaise / 100).toLocaleString('en-IN')})`,
    );
  }
  if (total === 0) throw new Error('At least one investor must fund the vehicle');

  return resolved;
}

/** Default: Me funds 100% of net vehicle cost (at create = purchase). */
export function fullSelfFunding(netVehicleCostPaise: number): ResolvedInvestor[] {
  return validateFundingStructure(netVehicleCostPaise, [
    { slot: 'me', investedPaise: netVehicleCostPaise },
  ]);
}

/**
 * Distribute a profit pool across capital investors proportional to invested capital.
 * Used for the Investor Pool (after operating-partner cut), not gross business profit.
 * Optional overrides must sum to the pool (legacy / tests only — vehicle sale never uses overrides).
 */
export function distributeInvestorProfits(
  poolPaise: number,
  funding: { slot: InvestorSlot; investedPaise: number; label: string }[],
  overrides?: InvestorProfitInput[],
): ResolvedInvestor[] {
  const pool = Math.round(poolPaise);
  const active = funding.filter((f) => f.investedPaise > 0 || f.slot === 'me');
  const totalInvested = active.reduce((s, f) => s + f.investedPaise, 0);
  if (totalInvested <= 0) throw new Error('No investor capital to allocate profit against');

  if (overrides && overrides.length > 0) {
    const map = new Map(overrides.map((o) => [o.slot, Math.round(o.profitPaise)]));
    const rows = active.map((f) => {
      const profitPaise = map.has(f.slot) ? (map.get(f.slot) as number) : 0;
      return {
        slot: f.slot,
        label: f.label,
        investedPaise: f.investedPaise,
        profitPaise,
        roiBps: calcRoiBps(profitPaise, f.investedPaise),
      };
    });
    const sum = rows.reduce((s, r) => s + (r.profitPaise ?? 0), 0);
    if (sum !== pool) {
      throw new Error(
        `Investor profits (₹${(sum / 100).toLocaleString('en-IN')}) must equal investor pool (₹${(pool / 100).toLocaleString('en-IN')})`,
      );
    }
    return rows;
  }

  // Proportional allocation; last investor gets remainder to avoid rounding drift
  let allocated = 0;
  const rows: ResolvedInvestor[] = active.map((f, idx) => {
    const isLast = idx === active.length - 1;
    const profitPaise = isLast
      ? pool - allocated
      : Math.round((pool * f.investedPaise) / totalInvested);
    if (!isLast) allocated += profitPaise;
    return {
      slot: f.slot,
      label: f.label,
      investedPaise: f.investedPaise,
      profitPaise,
      roiBps: f.investedPaise > 0 ? calcRoiBps(profitPaise, f.investedPaise) : null,
    };
  });
  return rows;
}

export function summarizeInvestorShares(rows: ResolvedInvestor[]): {
  myInvestedPaise: number;
  myProfitPaise: number;
  partnerInvestedPaise: number;
  partnerProfitPaise: number;
  myRoiBps: number | null;
} {
  const me = rows.find((r) => r.slot === 'me');
  const others = rows.filter((r) => r.slot !== 'me');
  const myInvestedPaise = me?.investedPaise ?? 0;
  const myProfitPaise = me?.profitPaise ?? 0;
  return {
    myInvestedPaise,
    myProfitPaise,
    partnerInvestedPaise: others.reduce((s, r) => s + r.investedPaise, 0),
    partnerProfitPaise: others.reduce((s, r) => s + (r.profitPaise ?? 0), 0),
    myRoiBps: me?.roiBps ?? null,
  };
}
