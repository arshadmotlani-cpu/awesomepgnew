export type AdminDuesStatus = 'unknown' | 'cleared' | 'has_dues';
export type AdminDepositRefundStatus =
  | 'unknown'
  | 'pending'
  | 'refunded'
  | 'blocked'
  | 'not_applicable';

export type BedInventoryStatus = 'available' | 'maintenance' | 'blocked';

export function labelAdminDuesStatus(status: AdminDuesStatus): string {
  switch (status) {
    case 'cleared':
      return 'All dues cleared';
    case 'has_dues':
      return 'Has outstanding dues';
    default:
      return 'Dues not reviewed';
  }
}

export function labelAdminDepositRefundStatus(status: AdminDepositRefundStatus): string {
  switch (status) {
    case 'pending':
      return 'Refund pending';
    case 'refunded':
      return 'Deposit refunded';
    case 'blocked':
      return 'Refund blocked (dues)';
    case 'not_applicable':
      return 'No deposit refund';
    default:
      return 'Refund not reviewed';
  }
}
