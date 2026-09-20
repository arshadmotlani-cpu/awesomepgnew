import type { HairActionPermission } from '@/src/hair/lib/auth/permissionTypes';

/** SSOT: who may receive customer advance / checkout payments (legacy + workforce aliases). */
export const ADVANCE_RECEIVE_PERMISSION: HairActionPermission = 'action:billing.checkout';

export const ADVANCE_RECEIVE_PERMISSION_DENIED_MESSAGE =
  'You do not have permission to receive advance payments. Ask an owner or biller for checkout access.';
