import type { ActiveTenancy } from '@/src/lib/residentActiveTenancy';
import type { ResidentFinancialAccount } from '@/src/lib/billing/residentFinancialTypes';
import type { ResidentTimelineResult } from '@/src/lib/admin/residentTimelineTypes';
import type { DepositSummary } from '@/src/services/deposits';
import type { ResidentBillingFormDefaults } from '@/src/services/residentBillingProfiles';
import type { SettledTenancy } from '@/src/services/residentAdmin';
import type { ResidencyAdminView } from '@/src/services/continuousResidency';

export type CommandCenterPendingItem = {
  id: string;
  category: string;
  label: string;
  detail?: string | null;
  priority: 'low' | 'medium' | 'high';
  href: string;
  createdAt: Date;
};

export type CommandCenterBillRow = {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  amountPaise: number;
  status: string;
  createdAt: Date;
  notes?: string | null;
  paidAt?: Date | null;
};

export type CommandCenterBookingHistoryRow = {
  bookingId: string;
  bookingCode: string;
  status: string;
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  moveInDate: string | null;
  moveOutDate: string | null;
  createdAt: Date;
};

export type CommandCenterRoomChangeRow = {
  id: string;
  bookingId: string;
  bookingCode: string | null;
  status: string;
  requestedShiftDate: string;
  createdAt: Date;
};

export type CommandCenterRequestRow = {
  id: string;
  type: string;
  status: string;
  amountPaise: number | null;
  createdAt: Date;
  bookingId: string;
  bookingCode: string | null;
};

export type CommandCenterVacatingRow = {
  id: string;
  bookingId: string;
  bookingCode: string | null;
  status: string;
  vacatingDate: string;
  settlementId: string | null;
  settlementStatus: string | null;
  createdAt: Date;
};

export type CommandCenterCustomer = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  kycStatus: 'pending' | 'approved' | 'rejected';
  residencyStatus: string;
  createdAt: Date;
};

export type CommandCenterOccupancy = {
  label: string;
  adminViewLabel: string;
};

export type ResidentCommandCenterData = {
  customer: CommandCenterCustomer;
  isVacated: boolean;
  activeTenancy: ActiveTenancy | null;
  settledTenancy: SettledTenancy | null;
  occupancy: CommandCenterOccupancy | null;
  financialAccount: ResidentFinancialAccount | null;
  depositSummary: DepositSummary | null;
  billingDefaults: ResidentBillingFormDefaults | null;
  invoiceHistory: CommandCenterBillRow[];
  pendingReviews: CommandCenterPendingItem[];
  bookingHistory: CommandCenterBookingHistoryRow[];
  roomChanges: CommandCenterRoomChangeRow[];
  openRequests: CommandCenterRequestRow[];
  vacatingRows: CommandCenterVacatingRow[];
  timeline: ResidentTimelineResult;
  residencyView: ResidencyAdminView | null;
  canArchive: boolean;
  pendingKycSubmissionId: string | null;
  verification: { isVerified: boolean } | null;
  canMarkCash: boolean;
  adminName: string;
};
