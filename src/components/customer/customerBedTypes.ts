export type BedSelectorBed = {
  bedId: string;
  bedCode: string;
  status: 'available' | 'maintenance' | 'blocked';
  manualOccupied?: boolean;
  isAvailableNow: boolean;
  nextAvailableDate: string | null;
  interestCount?: number;
  noticeInterestCount?: number;
  vacatingDate?: string | null;
  vacatingStatus?: 'pending' | 'approved' | null;
  reservedFrom?: string | null;
  /** Active 50% reserve hold — bed shows Reserved; daily/weekly still allowed. */
  activeBedReserveCheckIn?: string | null;
  availableUntilDate?: string | null;
  dailyRatePaise: number;
  weeklyRatePaise: number;
  monthlyRatePaise: number;
  securityDepositPaise: number;
  dailySecurityDepositPaise: number;
  weeklySecurityDepositPaise: number;
  monthlySecurityDepositPaise: number;
  /** Monthly-stay reference deposit from quote engine (pre-booking display only). */
  quotedMonthlyDepositPaise?: number;
};
