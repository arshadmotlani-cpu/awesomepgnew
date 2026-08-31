/**
 * SSOT display for frozen room-change quotes — gross vs net rent, no live repricing.
 */

import { paiseToInr } from '@/src/lib/format';
import type { RoomShiftQuoteSnapshot } from '@/src/services/roomShiftQuote';

export type RoomChangeQuoteDisplayLine = {
  label: string;
  amountPaise: number;
  kind: 'charge' | 'credit';
  note?: string;
};

export type RoomChangeQuoteDisplay = {
  shiftDate: string;
  oldMonthlyRentPaise: number;
  newMonthlyRentPaise: number;
  grossNewBedRentPaise: number;
  netNewBedRentDuePaise: number;
  feeDuePaise: number;
  depositDuePaise: number;
  totalDuePaise: number;
  prepaidCreditPaise: number;
  lines: RoomChangeQuoteDisplayLine[];
  summaryLines: string[];
};

export function formatRoomChangeQuoteForDisplay(
  quote: RoomShiftQuoteSnapshot,
): RoomChangeQuoteDisplay {
  const grossNewBedRentPaise = quote.newRentChargePaise;
  const netNewBedRentDuePaise = quote.newRentDuePaise;
  const prepaidCreditPaise = quote.unusedPrepaidCreditPaise;

  const lines: RoomChangeQuoteDisplayLine[] = (quote.lines ?? []).map((line) => ({
    label: line.label,
    amountPaise: line.amountPaise,
    kind: line.kind,
    note:
      line.label === 'New bed remaining rent' && netNewBedRentDuePaise < grossNewBedRentPaise
        ? `Net due after credit: ${paiseToInr(netNewBedRentDuePaise)}`
        : undefined,
  }));

  const summaryLines: string[] = [];
  if (grossNewBedRentPaise > 0 && netNewBedRentDuePaise !== grossNewBedRentPaise) {
    summaryLines.push(
      `New-room remaining rent (gross): ${paiseToInr(grossNewBedRentPaise)} · Net due: ${paiseToInr(netNewBedRentDuePaise)}`,
    );
  }
  if (prepaidCreditPaise > 0) {
    summaryLines.push(`Prepaid credit applied in quote: ${paiseToInr(prepaidCreditPaise)}`);
  }

  return {
    shiftDate: quote.shiftDate,
    oldMonthlyRentPaise: quote.oldMonthlyRentPaise,
    newMonthlyRentPaise: quote.newMonthlyRentPaise,
    grossNewBedRentPaise,
    netNewBedRentDuePaise,
    feeDuePaise: quote.feeDuePaise,
    depositDuePaise: quote.depositDuePaise,
    totalDuePaise: quote.totalDuePaise,
    prepaidCreditPaise,
    lines,
    summaryLines,
  };
}
