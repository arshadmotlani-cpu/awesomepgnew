/** Resident-safe electricity bill explanation — no internal IDs or PII. */

export type ResidentElectricityParticipantStatus =
  | 'Paid'
  | 'Pending'
  | 'Recovered from Deposit'
  | 'Waived'
  | 'Adjusted';

export type ResidentElectricityBillParticipant = {
  name: string;
  bedCode: string;
  stayDurationLabel: string;
  amountAllocatedPaise: number;
  status: ResidentElectricityParticipantStatus;
  isViewer: boolean;
};

export type ResidentElectricityBillExplanation = {
  billingMonth: string;
  roomNumber: string;
  meter: {
    previousReadingUnits: number;
    currentReadingUnits: number;
    unitsConsumed: number;
    ratePerUnitPaise: number;
    totalRoomBillPaise: number;
  };
  participants: ResidentElectricityBillParticipant[];
  summary: {
    roomTotalPaise: number;
    recoveredFromDepositPaise: number;
    collectedPaise: number;
    outstandingPaise: number;
    yourSharePaise: number;
    lateFeeLabel: string;
  };
};
