/**
 * Read-only bridge to financialMetricsEngine — no duplicated formulas.
 */

import type { FinancialMetricsRollup } from '@/src/roomOs/types';
import {
  computeDepositCashFlow,
  getPgFinancialMetrics,
} from '@/src/services/financialMetricsEngine';
import {
  getDepositCollectedByPgFromLedger,
  getDepositRefundedByPgFromLedger,
} from '@/src/services/depositLedgerMetrics';
import { firstOfMonth } from '@/src/services/billing';

export async function bridgeFinancialMetrics(input: {
  pgId: string;
  billingMonth: string;
}): Promise<FinancialMetricsRollup> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const [pgMetrics, depositCollectedRows, depositRefundedRows] = await Promise.all([
    getPgFinancialMetrics(billingMonth),
    getDepositCollectedByPgFromLedger(billingMonth),
    getDepositRefundedByPgFromLedger(billingMonth),
  ]);
  const row = pgMetrics.find((m) => m.pgId === input.pgId);
  const depositCollectedPaise =
    depositCollectedRows.find((m) => m.pgId === input.pgId)?.collectedPaise ?? 0;
  const depositRefundedPaise =
    depositRefundedRows.find((m) => m.pgId === input.pgId)?.refundedPaise ?? 0;

  if (!row) {
    return {
      billingMonth,
      operatingRevenuePaise: 0,
      rentPrincipalPaise: 0,
      lateFeePaise: 0,
      electricityPaise: 0,
      otherIncomePaise: 0,
      depositCollectedPaise,
      depositRefundedPaise,
      netCashInflowPaise: depositCollectedPaise - depositRefundedPaise,
      occupancyPct: 0,
      occupiedBeds: 0,
      totalBeds: 0,
    };
  }

  const deposits = computeDepositCashFlow({
    rentPrincipalPaise: row.rentPrincipalPaise,
    lateFeePaise: row.lateFeePaise,
    electricityPaise: row.electricityPaise,
    depositCollectedPaise,
    depositRefundedPaise,
  });

  return {
    billingMonth,
    operatingRevenuePaise: row.operatingRevenuePaise,
    rentPrincipalPaise: row.rentPrincipalPaise,
    lateFeePaise: row.lateFeePaise,
    electricityPaise: row.electricityPaise,
    otherIncomePaise: row.otherIncomePaise,
    depositCollectedPaise: deposits.collectedPaise,
    depositRefundedPaise: deposits.refundedPaise,
    netCashInflowPaise: deposits.netCashInflowPaise,
    occupancyPct: row.occupancyPct,
    occupiedBeds: row.occupiedBeds,
    totalBeds: row.totalBeds,
  };
}
