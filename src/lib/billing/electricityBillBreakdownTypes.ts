/**
 * Transparent electricity bill calculation — stored on electricity_bills.calculation_breakdown.
 * The invoice UI personalizes "your amount" from this room-level SSOT.
 */

export type ElectricitySettlementDisplayStatus =
  | 'fully_settled'
  | 'already_collected_at_checkout'
  | 'recovered_from_deposit'
  | 'active_billable'
  | 'excluded_zero_balance';

export type ElectricityTimelineEntry = {
  customerId: string;
  customerName: string;
  bookingId: string;
  role: 'departed' | 'active';
  vacatedOn: string | null;
  stayStart: string;
  stayEnd: string | null;
  stayLabel: string;
  activeDays: number;
  /** Pro-rata or checkout-calculated share before settlements. */
  calculatedSharePaise: number;
  recoveredFromDepositPaise: number;
  collectedDuringCheckoutPaise: number;
  /** Amount credited against the room bill (ledger / allocation). */
  creditAppliedToRoomBillPaise: number;
  monthlyInvoiceAmountPaise: number;
  settlementStatus: ElectricitySettlementDisplayStatus;
  settlementStatusLabel: string;
};

export type ElectricityBillCalculationBreakdown = {
  version: 1;
  roomNumber: string;
  billingMonth: string;
  meter: {
    previousReadingUnits: number;
    currentReadingUnits: number;
    unitsConsumed: number;
    ratePerUnitPaise: number;
    grossTotalPaise: number;
  };
  adjustments: {
    prepaidCreditPaise: number;
    prepaidCreditNote: string | null;
    checkoutCredits: Array<{
      customerId: string;
      customerName: string;
      amountPaise: number;
      recoveredFromDepositPaise: number;
      collectedDuringCheckoutPaise: number;
    }>;
    manualCreditPaise: number;
    totalDeductedPaise: number;
  };
  /** Historical offline payments and checkout recoveries recorded before invoice split. */
  previousContributions: Array<{
    customerId: string;
    customerName: string;
    bookingId: string;
    amountPaise: number;
    kind: 'historical' | 'checkout_recovery';
    reason: string | null;
    contributionDate: string;
    occupancyStart?: string | null;
    occupancyEnd?: string | null;
  }>;
  remainingBillPaise: number;
  useProRata: boolean;
  timeline: ElectricityTimelineEntry[];
  generatedAt: string;
};

export type ElectricityBreakdownViewerContext = {
  customerId: string;
  customerName: string;
  amountPayablePaise: number;
  invoiceNumber?: string | null;
  occupancyLabel?: string | null;
};

/** Occupancy row for electricity breakdown builder — no DB coupling. */
export type RoomElectricityTimelineRow = {
  bookingId: string;
  customerId: string;
  customerName: string;
  reservationStatus: string;
  bookingStatus: string;
  lower: string;
  upper: string | null;
  activeDays: number;
  stayStart: string;
  stayEnd: string | null;
  vacatedOn: string | null;
  role: 'departed' | 'active';
  settlement: {
    electricitySharePaise: number;
    recoveredFromDepositPaise: number;
    collectedDuringCheckoutPaise: number;
    creditAppliedToRoomBillPaise: number;
    ledgerAmountPaise: number;
  } | null;
};
