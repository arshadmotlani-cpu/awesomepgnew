export type ControlBoardCardAccent =
  | 'indigo'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'zinc'
  | 'sky'
  | 'violet'
  | 'orange';

export type ControlBoardCategory =
  | 'revenue'
  | 'collections'
  | 'operations'
  | 'inventory'
  | 'analytics'
  | 'pg';

export type ControlBoardCard = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  accent: ControlBoardCardAccent;
  category: ControlBoardCategory;
  priority?: 'high' | 'medium' | 'low';
  drillDownKey: string;
  count?: number;
  /** When set, card navigates to this page instead of opening the drawer. */
  href?: string;
};

export type ControlBoardDrillDownRow = {
  id: string;
  residentName: string;
  phone?: string;
  pgName: string;
  roomNumber?: string;
  bedCode?: string;
  amountPaise?: number;
  status?: string;
  timestamp?: string;
  meta?: string;
  actionItemId?: string;
  bookingId?: string;
  invoiceId?: string;
  href?: string;
  billingKind?: 'rent' | 'electricity' | 'deposit';
  billingMonth?: string;
  dueDate?: string;
  isOverdue?: boolean;
};

export type ControlBoardBulkActionKind = 'rent' | 'electricity' | 'kyc' | 'none';

export type ControlBoardDrillDown = {
  title: string;
  subtitle?: string;
  rows: ControlBoardDrillDownRow[];
  bulkActionKind: ControlBoardBulkActionKind;
  ledgerHref?: string;
  resolveAllActionItemType?: string;
};

export type ControlBoardData = {
  cards: ControlBoardCard[];
  billingMonth: string;
  monthLabel: string;
};
