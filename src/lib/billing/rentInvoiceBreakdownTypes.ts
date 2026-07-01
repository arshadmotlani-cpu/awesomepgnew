/**
 * Transparent rent invoice calculation — SSOT view model for resident + admin UI.
 */

export type RentInvoiceProration = {
  checkInDate: string | null;
  checkOutDate: string | null;
  daysStayed: number;
  daysInMonth: number;
  monthlyRentPaise: number;
  calculatedSharePaise: number;
  amountAlreadyCollectedPaise: number;
  remainingAmountPaise: number;
};

export type RentInvoiceBreakdown = {
  version: 1;
  invoiceId: string;
  invoiceNumber: string;
  billingMonth: string;
  billingMonthLabel: string;
  dueDate: string;
  roomNumber: string;
  bedCode: string;
  monthlyRentPaise: number;
  rentPricingSource: string;
  discountsPaise: number;
  creditsPaise: number;
  previousBalancePaise: number;
  /** Principal rent on the invoice (after proration, before late fee). */
  finalRentPaise: number;
  lateFeePaise: number;
  paidPrincipalPaise: number;
  paidLateFeePaise: number;
  /** Total still owed (principal + late fee − paid). */
  balanceDuePaise: number;
  isPrivateRoom: boolean;
  occupancyLabel: string;
  proration: RentInvoiceProration | null;
  notes: string | null;
  generatedAt: string;
};
