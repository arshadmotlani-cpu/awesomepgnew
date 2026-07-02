export type BedSelectorBed = {
  bedId: string;
  bedCode: string;
  /** Public-only override for special PGs (does not affect admin/DB lifecycle). */
  forcePublicOccupied?: boolean;
  status: 'available' | 'maintenance' | 'blocked';
  manualOccupied?: boolean;
  isAvailableNow: boolean;
  isOccupiedToday?: boolean;
  nextAvailableDate: string | null;
  interestCount?: number;
  noticeInterestCount?: number;
  vacatingDate?: string | null;
  vacatingStatus?: 'pending' | 'approved' | null;
  reservedFrom?: string | null;
  /** Active 50% reserve hold — bed shows Reserved; daily/weekly still allowed. */
  activeBedReserveCheckIn?: string | null;
  stayType?: string | null;
  durationMode?: string | null;
  expectedCheckoutDate?: string | null;
  checkoutSettlement?: {
    id: string;
    status: string;
    suppressed?: boolean;
    depositRequiredPaise?: number;
    depositHeldPaise?: number;
    electricityPending?: boolean;
  } | null;
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
