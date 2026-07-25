import { calcRoiBps } from '@/src/capital/lib/money';
import {
  ACTIVE_INVESTOR_SLOTS,
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
 * Validate Layer 2 funding: Me + optional Partner must equal Purchase Price.
 * New writes reject investor_3.
 */
export function validateFundingStructure(
  purchasePricePaise: number,
  investors: InvestorFundingInput[],
): ResolvedInvestor[] {
  if (purchasePricePaise <= 0) throw new Error('Purchase price must be positive');

  const bySlot = new Map<InvestorSlot, InvestorFundingInput>();
  for (const inv of investors) {
    if (!INVESTOR_SLOTS.includes(inv.slot)) throw new Error(`Invalid investor slot: ${inv.slot}`);
    if (inv.slot === 'investor_3' && inv.investedPaise > 0) {
      throw new Error('Investor 3 is no longer supported — use My Investment + Partner only');
    }
    if (inv.investedPaise < 0) throw new Error('Invested amount cannot be negative');
    if (bySlot.has(inv.slot)) throw new Error(`Duplicate investor slot: ${inv.slot}`);
    bySlot.set(inv.slot, inv);
  }

  const resolved: ResolvedInvestor[] = ACTIVE_INVESTOR_SLOTS.map((slot) => {
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
  if (total !== purchasePricePaise) {
    throw new Error(
      `Investor funding (₹${(total / 100).toLocaleString('en-IN')}) must equal purchase price (₹${(purchasePricePaise / 100).toLocaleString('en-IN')})`,
    );
  }
  if (total === 0) throw new Error('At least one investor must fund the vehicle');

  return resolved;
}

/** Default: Me funds 100% of purchase price. */
export function fullSelfFunding(purchasePricePaise: number): ResolvedInvestor[] {
  return validateFundingStructure(purchasePricePaise, [
    { slot: 'me', investedPaise: purchasePricePaise },
  ]);
}

/**
 * Distribute a profit pool across capital investors proportional to invested capital.
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
